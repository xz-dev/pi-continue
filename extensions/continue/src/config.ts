import { existsSync, readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
	ConfigScope,
	FallbackMode,
	ContinuationConfig,
	DocumentSyncMode,
	ContinuationReasoning,
	PromptOverridePolicy,
} from "./types.ts";
import { resolveAgentDir } from "./agent-dir.ts";

const REASONING_LEVELS = new Set<ContinuationReasoning>([
	"inherit",
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
]);
const PROMPT_OVERRIDE_POLICIES = new Set<PromptOverridePolicy>([
	"package-default",
	"global-override",
	"project-override",
]);
const DOCUMENT_SYNC_MODES = new Set<DocumentSyncMode>(["always", "off"]);
const FALLBACK_MODES = new Set<FallbackMode>(["deterministic-summary", "abort"]);
const mutationQueues = new Map<string, Promise<void>>();

async function withConfigMutationQueue(path: string, work: () => Promise<void>): Promise<void> {
	const previous = mutationQueues.get(path) ?? Promise.resolve();
	const next = previous.then(work, work);
	mutationQueues.set(path, next);
	try {
		await next;
	} finally {
		if (mutationQueues.get(path) === next) mutationQueues.delete(path);
	}
}

export const DEFAULT_CONTINUE_CONFIG: ContinuationConfig = {
	enabled: true,
	summarizerModel: "inherit",
	reasoning: "inherit",
	historyMaxTokens: null,
	splitPrefixMaxTokens: null,
	continuationDocPath: "CONTINUE.md",
	continuationDocSyncMode: "off",
	agentGuidePath: "AGENTS.md",
	agentGuideSyncMode: "off",
	midRunGuardEnabled: true,
	appendCompactionMetadata: false,
	appendFileTags: false,
	promptOverridePolicy: "project-override",
	fallbackMode: "deterministic-summary",
};

interface PartialContinuationConfig {
	enabled?: boolean;
	summarizerModel?: string;
	reasoning?: string;
	historyMaxTokens?: number | null;
	splitPrefixMaxTokens?: number | null;
	continuationDocPath?: string;
	continuationDocSyncMode?: string;
	agentGuidePath?: string;
	agentGuideSyncMode?: string;
	midRunGuardEnabled?: boolean;
	appendCompactionMetadata?: boolean;
	appendFileTags?: boolean;
	promptOverridePolicy?: string;
	fallbackMode?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function asBoolean(value: unknown): boolean | undefined {
	return typeof value === "boolean" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asNullableNumber(value: unknown): number | null | undefined {
	if (value === null) return null;
	return asNumber(value);
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function parsePartialConfig(value: unknown): PartialContinuationConfig {
	if (!isRecord(value)) return {};
	return {
		enabled: asBoolean(value.enabled),
		summarizerModel: asString(value.summarizerModel),
		reasoning: asString(value.reasoning),
		historyMaxTokens: asNullableNumber(value.historyMaxTokens),
		splitPrefixMaxTokens: asNullableNumber(value.splitPrefixMaxTokens),
		continuationDocPath: asString(value.continuationDocPath),
		continuationDocSyncMode: asString(value.continuationDocSyncMode),
		agentGuidePath: asString(value.agentGuidePath),
		agentGuideSyncMode: asString(value.agentGuideSyncMode),
		midRunGuardEnabled: asBoolean(value.midRunGuardEnabled),
		appendCompactionMetadata: asBoolean(value.appendCompactionMetadata),
		appendFileTags: asBoolean(value.appendFileTags),
		promptOverridePolicy: asString(value.promptOverridePolicy),
		fallbackMode: asString(value.fallbackMode),
	};
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function readPartialConfig(path: string): PartialContinuationConfig {
	if (!existsSync(path)) return {};
	try {
		return parsePartialConfig(JSON.parse(readFileSync(path, "utf8")));
	} catch (error) {
		throw new Error(`Failed to read pi-continue config at ${path}: ${errorMessage(error)}`);
	}
}

function normalizeReasoning(value: string | undefined): ContinuationReasoning {
	return value !== undefined && REASONING_LEVELS.has(value as ContinuationReasoning)
		? (value as ContinuationReasoning)
		: DEFAULT_CONTINUE_CONFIG.reasoning;
}

function normalizePromptOverridePolicy(value: string | undefined): PromptOverridePolicy {
	return value !== undefined && PROMPT_OVERRIDE_POLICIES.has(value as PromptOverridePolicy)
		? (value as PromptOverridePolicy)
		: DEFAULT_CONTINUE_CONFIG.promptOverridePolicy;
}

function normalizeSyncMode(value: string | undefined, fallback: DocumentSyncMode): DocumentSyncMode {
	return value !== undefined && DOCUMENT_SYNC_MODES.has(value as DocumentSyncMode)
		? (value as DocumentSyncMode)
		: fallback;
}

function normalizeFallbackMode(value: string | undefined): FallbackMode {
	return value !== undefined && FALLBACK_MODES.has(value as FallbackMode)
		? (value as FallbackMode)
		: DEFAULT_CONTINUE_CONFIG.fallbackMode;
}

function normalizePath(value: string | undefined, fallback: string): string {
	const trimmed = value?.trim();
	return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function normalizeTokenOverride(value: number | null | undefined): number | null {
	if (value === null || value === undefined) return null;
	const rounded = Math.round(value);
	return rounded > 0 ? rounded : null;
}

function normalizeSummarizerModel(value: string | undefined): string {
	const trimmed = value?.trim();
	return trimmed && trimmed.length > 0 ? trimmed : DEFAULT_CONTINUE_CONFIG.summarizerModel;
}

function normalizeConfig(partial: PartialContinuationConfig): ContinuationConfig {
	return {
		enabled: partial.enabled ?? DEFAULT_CONTINUE_CONFIG.enabled,
		summarizerModel: normalizeSummarizerModel(partial.summarizerModel),
		reasoning: normalizeReasoning(partial.reasoning),
		historyMaxTokens: normalizeTokenOverride(partial.historyMaxTokens),
		splitPrefixMaxTokens: normalizeTokenOverride(partial.splitPrefixMaxTokens),
		continuationDocPath: normalizePath(partial.continuationDocPath, DEFAULT_CONTINUE_CONFIG.continuationDocPath),
		continuationDocSyncMode: normalizeSyncMode(partial.continuationDocSyncMode, DEFAULT_CONTINUE_CONFIG.continuationDocSyncMode),
		agentGuidePath: normalizePath(partial.agentGuidePath, DEFAULT_CONTINUE_CONFIG.agentGuidePath),
		agentGuideSyncMode: normalizeSyncMode(partial.agentGuideSyncMode, DEFAULT_CONTINUE_CONFIG.agentGuideSyncMode),
		midRunGuardEnabled: partial.midRunGuardEnabled ?? DEFAULT_CONTINUE_CONFIG.midRunGuardEnabled,
		appendCompactionMetadata: partial.appendCompactionMetadata ?? DEFAULT_CONTINUE_CONFIG.appendCompactionMetadata,
		appendFileTags: partial.appendFileTags ?? DEFAULT_CONTINUE_CONFIG.appendFileTags,
		promptOverridePolicy: normalizePromptOverridePolicy(partial.promptOverridePolicy),
		fallbackMode: normalizeFallbackMode(partial.fallbackMode),
	};
}

export function getGlobalConfigPath(): string {
	return join(resolveAgentDir(), "extensions", "pi-continue.json");
}

export function getProjectConfigPath(projectRoot: string): string {
	return join(projectRoot, ".pi", "extensions", "pi-continue.json");
}

export function loadContinuationConfig(projectRoot: string): ContinuationConfig {
	const globalConfig = readPartialConfig(getGlobalConfigPath());
	const projectConfig = readPartialConfig(getProjectConfigPath(projectRoot));
	return normalizeConfig({ ...globalConfig, ...projectConfig });
}

export function loadScopeConfig(scope: ConfigScope, projectRoot: string): ContinuationConfig {
	return normalizeConfig(readPartialConfig(getConfigPath(scope, projectRoot)));
}

function serializeConfig(config: ContinuationConfig): string {
	return `${JSON.stringify(config, null, 2)}\n`;
}

function getConfigPath(scope: ConfigScope, projectRoot: string): string {
	return scope === "global" ? getGlobalConfigPath() : getProjectConfigPath(projectRoot);
}

/** Persist the full config at the selected scope. */
export async function saveContinuationConfig(scope: ConfigScope, projectRoot: string, config: ContinuationConfig): Promise<void> {
	const targetPath = getConfigPath(scope, projectRoot);
	await withConfigMutationQueue(targetPath, async () => {
		await mkdir(dirname(targetPath), { recursive: true });
		await writeFile(targetPath, serializeConfig(config), "utf8");
	});
}

/** Reset the selected config scope by deleting the scoped file. */
export async function resetContinuationConfig(scope: ConfigScope, projectRoot: string): Promise<void> {
	const targetPath = getConfigPath(scope, projectRoot);
	await withConfigMutationQueue(targetPath, async () => {
		if (!existsSync(targetPath)) return;
		await rm(targetPath, { force: true });
	});
}
