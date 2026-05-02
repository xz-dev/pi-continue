import type { Api, Model } from "@mariozechner/pi-ai";
import { getSupportedThinkingLevels } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { loadHistoryPromptAssets, loadSplitPromptAssets } from "./assets.ts";
import { snapshotFileOperations } from "./compaction-preparation.ts";
import { DEFAULT_CONTINUE_CONFIG, loadContinuationConfig, loadScopeConfig, resetContinuationConfig, saveContinuationConfig } from "./config.ts";
import { showLatestContinuationLedger } from "./ledger-viewer.ts";
import { showScrollableTextOverlay } from "./text-viewer.ts";
import { readEffectivePiCompactionSettings } from "./pi-settings.ts";
import { loadPiInternals } from "./pi-internals.ts";
import { compileHistoryPrompt, compileSplitPrompt, renderPromptPreview } from "./prompt.ts";
import { resolveProjectContext } from "./project.ts";
import { resolveSummarizerModel } from "./model-settings.ts";
import { getLatestContinuationEvent, getLatestContinuationLedger, type ContinuationRuntimeState } from "./runtime.ts";
import { renderStatus } from "./status.ts";
import { commandHasUi } from "./ui.ts";
import type { ConfigScope, ContinuationConfig, PreviewPayload } from "./types.ts";

function parseScope(args: string | undefined): ConfigScope {
	const trimmed = args?.trim().toLowerCase();
	return trimmed === "global" ? "global" : "project";
}

function joinArgs(args: string | undefined): string | undefined {
	const trimmed = args?.trim();
	return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

async function requireUi(ctx: ExtensionCommandContext): Promise<boolean> {
	return commandHasUi(ctx);
}

async function buildPromptPreviewPayload(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	customInstructions: string | undefined,
): Promise<PreviewPayload | undefined> {
	const initialProjectContext = await resolveProjectContext(pi, ctx.cwd, DEFAULT_CONTINUE_CONFIG.continuationDocPath);
	const config = loadContinuationConfig(initialProjectContext.projectRoot);
	const projectContext = await resolveProjectContext(pi, ctx.cwd, config.continuationDocPath, config.agentGuidePath);
	const piCompactionSettings = readEffectivePiCompactionSettings(projectContext.projectRoot);
	const internals = await loadPiInternals();
	const preparation = internals.prepareCompaction(ctx.sessionManager.getBranch(), piCompactionSettings) as {
		previousSummary?: string;
		messagesToSummarize: unknown[];
		turnPrefixMessages: unknown[];
		isSplitTurn: boolean;
		fileOps: { read: Set<string>; written: Set<string>; edited: Set<string> };
	} | undefined;
	if (!preparation) return undefined;
	const scenario = preparation.previousSummary ? "update" : "initial";
	const historyTranscript = internals.serializeConversation(internals.convertToLlm(preparation.messagesToSummarize));
	const fileOps = snapshotFileOperations(preparation.fileOps);
	const historyAssets = loadHistoryPromptAssets(projectContext.projectRoot, config.promptOverridePolicy, scenario);
	const history = compileHistoryPrompt(historyAssets, {
		scenario,
		projectRoot: projectContext.projectRoot,
		continuationDocPath: projectContext.continuationDocPath,
		existingContinuationDoc: projectContext.existingContinuationDoc,
		agentGuidePath: projectContext.agentGuidePath,
		existingAgentGuide: projectContext.existingAgentGuide,
		previousSummary: preparation.previousSummary,
		historyTranscript,
		customInstructions,
		fileOps,
	});
	const split = preparation.isSplitTurn && preparation.turnPrefixMessages.length > 0
		? compileSplitPrompt(loadSplitPromptAssets(projectContext.projectRoot, config.promptOverridePolicy), {
				projectRoot: projectContext.projectRoot,
				continuationDocPath: projectContext.continuationDocPath,
				splitPrefixTranscript: internals.serializeConversation(internals.convertToLlm(preparation.turnPrefixMessages)),
				customInstructions,
			})
		: undefined;
	return {
		history,
		split,
		scenario,
		isSplitTurn: preparation.isSplitTurn,
	};
}

async function showText(ctx: ExtensionCommandContext, title: string, content: string): Promise<void> {
	if (!(await requireUi(ctx, title))) return;
	const shown = await showScrollableTextOverlay(ctx, { title, content });
	if (!shown) ctx.ui.notify(`${title} overlay is unavailable in this Pi mode.`, "warning");
}

async function chooseModel(ctx: ExtensionCommandContext): Promise<string | undefined> {
	const options = ["inherit current model", ...ctx.modelRegistry.getAvailable().map((model) => `${model.provider}/${model.id}`), "enter provider/model manually"];
	const selected = await ctx.ui.select("Summarizer model", options);
	if (!selected) return undefined;
	if (selected === "inherit current model") return "inherit";
	if (selected === "enter provider/model manually") {
		const entered = await ctx.ui.input("Summarizer model", "provider/model or inherit");
		return entered?.trim();
	}
	return selected;
}

const ALL_REASONING_OPTIONS: readonly ContinuationConfig["reasoning"][] = ["inherit", "off", "minimal", "low", "medium", "high", "xhigh"];

/** Return operator-selectable reasoning levels, hiding levels unsupported by the resolved summarizer model. */
export function getReasoningOptionsForModel(model: Model<Api> | undefined): ContinuationConfig["reasoning"][] {
	if (!model) return [...ALL_REASONING_OPTIONS];
	return ["inherit", ...getSupportedThinkingLevels(model)];
}

async function chooseReasoning(ctx: ExtensionCommandContext, config: ContinuationConfig): Promise<ContinuationConfig["reasoning"] | undefined> {
	const selected = await ctx.ui.select("Reasoning level", getReasoningOptionsForModel(resolveSummarizerModel(ctx, config)));
	return selected as ContinuationConfig["reasoning"] | undefined;
}

async function chooseLedgerDisplayMode(ctx: ExtensionCommandContext): Promise<ContinuationConfig["ledgerDisplayMode"] | undefined> {
	const selected = await ctx.ui.select("Ledger display", ["overlay", "off"]);
	return selected as ContinuationConfig["ledgerDisplayMode"] | undefined;
}

async function chooseTokenOverride(
	ctx: ExtensionCommandContext,
	title: string,
	current: number | null,
): Promise<number | null | undefined> {
	const choice = await ctx.ui.select(title, ["use Pi default", `keep current (${current ?? "Pi default"})`, "enter tokens"]);
	if (!choice) return undefined;
	if (choice === "use Pi default") return null;
	if (choice.startsWith("keep current")) return current;
	const entered = await ctx.ui.input(title, "positive integer or blank for cancel");
	if (!entered) return undefined;
	const parsed = Number.parseInt(entered, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

async function updateSetting(
	scope: ConfigScope,
	projectRoot: string,
	config: ContinuationConfig,
	mutator: (current: ContinuationConfig) => Promise<ContinuationConfig | undefined>,
): Promise<ContinuationConfig> {
	const next = await mutator(config);
	if (!next) return config;
	await saveContinuationConfig(scope, projectRoot, next);
	return next;
}

/** Edit scoped config in the TUI. */
export async function runSettingsDialog(pi: ExtensionAPI, ctx: ExtensionCommandContext, args: string | undefined): Promise<void> {
	if (!(await requireUi(ctx))) return;
	const projectContext = await resolveProjectContext(pi, ctx.cwd, DEFAULT_CONTINUE_CONFIG.continuationDocPath);
	let scope = parseScope(args);
	let config = loadScopeConfig(scope, projectContext.projectRoot);
	while (true) {
		const selected = await ctx.ui.select("Continuation settings", [
			`scope: ${scope}`,
			`enabled: ${config.enabled ? "yes" : "no"}`,
			`summarizer model: ${config.summarizerModel}`,
			`reasoning: ${config.reasoning}`,
			`history tokens: ${config.historyMaxTokens ?? "Pi default"}`,
			`split tokens: ${config.splitPrefixMaxTokens ?? "Pi default"}`,
			`continuation doc: ${config.continuationDocPath}`,
			`continuation sync: ${config.continuationDocSyncMode}`,
			`agent guide path: ${config.agentGuidePath}`,
			`agent guide sync: ${config.agentGuideSyncMode} (full replacement only)`,
			`mid-run guard: ${config.midRunGuardEnabled ? "yes" : "no"}`,
			`append compaction metadata: ${config.appendCompactionMetadata ? "yes" : "no"}`,
			`append file tags: ${config.appendFileTags ? "yes" : "no"}`,
			`prompt override policy: ${config.promptOverridePolicy}`,
			`ledger display: ${config.ledgerDisplayMode}`,
			`reset ${scope} config`,
			"done",
		]);
		if (!selected || selected === "done") return;
		if (selected.startsWith("scope:")) {
			scope = scope === "project" ? "global" : "project";
			config = loadScopeConfig(scope, projectContext.projectRoot);
			ctx.ui.notify(`Editing ${scope} continuation config`, "info");
			continue;
		}
		if (selected.startsWith("enabled:")) {
			config = await updateSetting(scope, projectContext.projectRoot, config, async (current) => ({
				...current,
				enabled: !current.enabled,
			}));
			continue;
		}
		if (selected.startsWith("summarizer model:")) {
			config = await updateSetting(scope, projectContext.projectRoot, config, async (current) => {
				const next = await chooseModel(ctx);
				return next ? { ...current, summarizerModel: next } : undefined;
			});
			continue;
		}
		if (selected.startsWith("reasoning:")) {
			config = await updateSetting(scope, projectContext.projectRoot, config, async (current) => {
				const next = await chooseReasoning(ctx, current);
				return next ? { ...current, reasoning: next } : undefined;
			});
			continue;
		}
		if (selected.startsWith("history tokens:")) {
			config = await updateSetting(scope, projectContext.projectRoot, config, async (current) => {
				const next = await chooseTokenOverride(ctx, "History max tokens", current.historyMaxTokens);
				return next !== undefined ? { ...current, historyMaxTokens: next } : undefined;
			});
			continue;
		}
		if (selected.startsWith("split tokens:")) {
			config = await updateSetting(scope, projectContext.projectRoot, config, async (current) => {
				const next = await chooseTokenOverride(ctx, "Split-prefix max tokens", current.splitPrefixMaxTokens);
				return next !== undefined ? { ...current, splitPrefixMaxTokens: next } : undefined;
			});
			continue;
		}
		if (selected.startsWith("continuation doc:")) {
			config = await updateSetting(scope, projectContext.projectRoot, config, async (current) => {
				const next = await ctx.ui.input("Continuation doc path", "repo-relative path, default CONTINUE.md");
				return next?.trim() ? { ...current, continuationDocPath: next.trim() } : undefined;
			});
			continue;
		}
		if (selected.startsWith("continuation sync:")) {
			config = await updateSetting(scope, projectContext.projectRoot, config, async (current) => {
				const next = await ctx.ui.select("Continuation doc sync", ["off", "always"]);
				return next ? { ...current, continuationDocSyncMode: next as ContinuationConfig["continuationDocSyncMode"] } : undefined;
			});
			continue;
		}
		if (selected.startsWith("agent guide path:")) {
			config = await updateSetting(scope, projectContext.projectRoot, config, async (current) => {
				const next = await ctx.ui.input("Agent guide path", "repo-relative path, default AGENTS.md");
				return next?.trim() ? { ...current, agentGuidePath: next.trim() } : undefined;
			});
			continue;
		}
		if (selected.startsWith("agent guide sync:")) {
			config = await updateSetting(scope, projectContext.projectRoot, config, async (current) => {
				const next = await ctx.ui.select("Agent guide sync", ["off", "always"]);
				return next ? { ...current, agentGuideSyncMode: next as ContinuationConfig["agentGuideSyncMode"] } : undefined;
			});
			continue;
		}
		if (selected.startsWith("mid-run guard:")) {
			config = await updateSetting(scope, projectContext.projectRoot, config, async (current) => ({
				...current,
				midRunGuardEnabled: !current.midRunGuardEnabled,
			}));
			continue;
		}
		if (selected.startsWith("append compaction metadata:")) {
			config = await updateSetting(scope, projectContext.projectRoot, config, async (current) => ({
				...current,
				appendCompactionMetadata: !current.appendCompactionMetadata,
			}));
			continue;
		}
		if (selected.startsWith("append file tags:")) {
			config = await updateSetting(scope, projectContext.projectRoot, config, async (current) => ({
				...current,
				appendFileTags: !current.appendFileTags,
			}));
			continue;
		}
		if (selected.startsWith("prompt override policy:")) {
			config = await updateSetting(scope, projectContext.projectRoot, config, async (current) => {
				const next = await ctx.ui.select("Prompt override policy", ["package-default", "global-override", "project-override"]);
				return next ? { ...current, promptOverridePolicy: next as ContinuationConfig["promptOverridePolicy"] } : undefined;
			});
			continue;
		}
		if (selected.startsWith("ledger display:")) {
			config = await updateSetting(scope, projectContext.projectRoot, config, async (current) => {
				const next = await chooseLedgerDisplayMode(ctx);
				return next ? { ...current, ledgerDisplayMode: next } : undefined;
			});
			continue;
		}
		if (selected === `reset ${scope} config`) {
			const confirmed = await ctx.ui.confirm("Reset config", `Delete ${scope} config?`);
			if (confirmed) {
				await resetContinuationConfig(scope, projectContext.projectRoot);
				config = loadScopeConfig(scope, projectContext.projectRoot);
				ctx.ui.notify(`Reset ${scope} continuation config`, "info");
			}
		}
	}
}

/** Show effective config and prompt provenance. */
export async function runStatusCommand(pi: ExtensionAPI, ctx: ExtensionCommandContext, runtime: ContinuationRuntimeState): Promise<void> {
	if (!(await requireUi(ctx))) return;
	const initialProjectContext = await resolveProjectContext(pi, ctx.cwd, DEFAULT_CONTINUE_CONFIG.continuationDocPath);
	const config = loadContinuationConfig(initialProjectContext.projectRoot);
	const projectContext = await resolveProjectContext(pi, ctx.cwd, config.continuationDocPath, config.agentGuidePath);
	const payload = await buildPromptPreviewPayload(pi, ctx, undefined);
	await showText(
		ctx,
		"continuation status",
		renderStatus(
			ctx,
			config,
			projectContext.projectRoot,
			projectContext.continuationDocPath,
			projectContext.agentGuidePath,
			payload,
			getLatestContinuationEvent(runtime),
		),
	);
}

/** Show the latest in-memory Continuation Ledger without mutating the transcript. */
export async function runLedgerCommand(ctx: ExtensionCommandContext, runtime: ContinuationRuntimeState): Promise<void> {
	await showLatestContinuationLedger(ctx, getLatestContinuationLedger(runtime));
}

/** Reset scoped config. */
export async function runResetCommand(pi: ExtensionAPI, ctx: ExtensionCommandContext, args: string | undefined): Promise<void> {
	if (!(await requireUi(ctx))) return;
	const projectContext = await resolveProjectContext(pi, ctx.cwd, DEFAULT_CONTINUE_CONFIG.continuationDocPath);
	const scope = parseScope(args);
	const confirmed = await ctx.ui.confirm("Reset config", `Delete ${scope} config?`);
	if (!confirmed) return;
	await resetContinuationConfig(scope, projectContext.projectRoot);
	ctx.ui.notify(`Reset ${scope} continuation config`, "info");
}

/** Preview prompt payloads. */
export async function runPreviewCommand(pi: ExtensionAPI, ctx: ExtensionCommandContext, args: string | undefined): Promise<void> {
	if (!(await requireUi(ctx))) return;
	const payload = await buildPromptPreviewPayload(pi, ctx, joinArgs(args));
	if (!payload) {
		ctx.ui.notify("No compaction preview is available.", "warning");
		return;
	}
	const sections = [
		renderPromptPreview(`History prompt (${payload.scenario})`, payload.history),
		payload.split ? renderPromptPreview("Split-prefix prompt", payload.split) : undefined,
	].filter((section): section is string => section !== undefined);
	await showText(ctx, "continuation prompt preview", sections.join("\n\n---\n\n"));
}
