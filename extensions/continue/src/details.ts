import { snapshotFileOperations, type FileOperations } from "./compaction-preparation.ts";
import type {
	AgentGuideWriteStatus,
	ContinuationCompactionDetails,
	ContinuationSynthesisTelemetry,
	PromptPassTelemetry,
	PromptPassUsageTelemetry,
} from "./types.ts";

interface PromptPassMetadata {
	requestedModel: string;
	responseModel?: string;
	httpStatus?: number;
	totalTokens: number;
	costTotal: number;
}

interface ContinuationSummaryMetadata {
	kind: "pi-continue/v4";
	readFileCount: number;
	modifiedFileCount: number;
	documentSyncId?: string;
	agentGuideSyncId?: string;
	agentGuideWriteStatus?: AgentGuideWriteStatus;
	agentGuideChangeReason?: string;
	continuationEventId?: string;
	synthesis?: {
		history?: PromptPassMetadata;
		split?: PromptPassMetadata;
		totalCost?: number;
		totalTokens?: number;
	};
}

const CONTINUATION_DETAILS_KIND_V4 = "pi-continue/v4";
const CONTINUATION_DETAILS_KEYS = new Set<string>([
	"kind",
	"readFiles",
	"modifiedFiles",
	"documentSyncId",
	"agentGuideSyncId",
	"agentGuideWriteStatus",
	"agentGuideChangeReason",
	"continuationEventId",
	"synthesis",
]);
const SYNTHESIS_KEYS = new Set<string>(["history", "split", "totalCost", "totalTokens"]);
const PROMPT_PASS_KEYS = new Set<string>(["requestedModel", "responseModel", "responseId", "usage", "httpStatus"]);
const USAGE_KEYS = new Set<string>(["input", "output", "cacheRead", "cacheWrite", "totalTokens", "costTotal"]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function asAgentGuideWriteStatus(value: unknown): AgentGuideWriteStatus | undefined {
	if (value === "sync-off" || value === "no-replacement" || value === "replacement-pending") return value;
	return undefined;
}

function hasOnlyKeys(value: Record<string, unknown>, keys: Set<string>): boolean {
	return Object.keys(value).every((key) => keys.has(key));
}

function optionalTrimmedString(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function invalidOptionalString(value: unknown): boolean {
	return value !== undefined && optionalTrimmedString(value) === undefined;
}

function optionalNonNegativeNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function invalidOptionalNumber(value: unknown): boolean {
	return value !== undefined && optionalNonNegativeNumber(value) === undefined;
}

function requiredNonNegativeNumber(value: unknown): number | undefined {
	return optionalNonNegativeNumber(value);
}

function parseUsageTelemetry(value: unknown): PromptPassUsageTelemetry | undefined {
	if (!isRecord(value) || !hasOnlyKeys(value, USAGE_KEYS)) return undefined;
	const input = requiredNonNegativeNumber(value.input);
	const output = requiredNonNegativeNumber(value.output);
	const cacheRead = requiredNonNegativeNumber(value.cacheRead);
	const cacheWrite = requiredNonNegativeNumber(value.cacheWrite);
	const totalTokens = requiredNonNegativeNumber(value.totalTokens);
	const costTotal = requiredNonNegativeNumber(value.costTotal);
	if (input === undefined || output === undefined || cacheRead === undefined || cacheWrite === undefined || totalTokens === undefined || costTotal === undefined) {
		return undefined;
	}
	return { input, output, cacheRead, cacheWrite, totalTokens, costTotal };
}

function parsePromptPassTelemetry(value: unknown): PromptPassTelemetry | undefined {
	if (!isRecord(value) || !hasOnlyKeys(value, PROMPT_PASS_KEYS)) return undefined;
	const requestedModel = optionalTrimmedString(value.requestedModel);
	const usage = parseUsageTelemetry(value.usage);
	if (!requestedModel || !usage) return undefined;
	if (invalidOptionalString(value.responseModel) || invalidOptionalString(value.responseId) || invalidOptionalNumber(value.httpStatus)) return undefined;
	const responseModel = optionalTrimmedString(value.responseModel);
	const responseId = optionalTrimmedString(value.responseId);
	const httpStatus = optionalNonNegativeNumber(value.httpStatus);
	return {
		requestedModel,
		responseModel,
		responseId,
		usage,
		httpStatus,
	};
}

function parseSynthesisTelemetry(value: unknown): ContinuationSynthesisTelemetry | undefined {
	if (!isRecord(value) || !hasOnlyKeys(value, SYNTHESIS_KEYS)) return undefined;
	if (invalidOptionalNumber(value.totalCost) || invalidOptionalNumber(value.totalTokens)) return undefined;
	const history = value.history === undefined ? undefined : parsePromptPassTelemetry(value.history);
	const split = value.split === undefined ? undefined : parsePromptPassTelemetry(value.split);
	if ((value.history !== undefined && !history) || (value.split !== undefined && !split)) return undefined;
	const totalCost = optionalNonNegativeNumber(value.totalCost);
	const totalTokens = optionalNonNegativeNumber(value.totalTokens);
	if (!history && !split && totalCost === undefined && totalTokens === undefined) return undefined;
	return {
		history,
		split,
		totalCost,
		totalTokens,
	};
}

function computeSynthesisTotals(history: PromptPassTelemetry | undefined, split: PromptPassTelemetry | undefined): { totalCost: number | undefined; totalTokens: number | undefined } {
	const totalCost = (history?.usage.costTotal ?? 0) + (split?.usage.costTotal ?? 0);
	const totalTokens = (history?.usage.totalTokens ?? 0) + (split?.usage.totalTokens ?? 0);
	return {
		totalCost: history || split ? totalCost : undefined,
		totalTokens: history || split ? totalTokens : undefined,
	};
}

function clonePromptPassTelemetry(telemetry: PromptPassTelemetry | undefined): PromptPassTelemetry | undefined {
	if (!telemetry) return undefined;
	return {
		requestedModel: telemetry.requestedModel,
		responseModel: telemetry.responseModel,
		responseId: telemetry.responseId,
		usage: {
			input: telemetry.usage.input,
			output: telemetry.usage.output,
			cacheRead: telemetry.usage.cacheRead,
			cacheWrite: telemetry.usage.cacheWrite,
			totalTokens: telemetry.usage.totalTokens,
			costTotal: telemetry.usage.costTotal,
		},
		httpStatus: telemetry.httpStatus,
	};
}

export function buildContinuationSynthesisTelemetry(
	history: PromptPassTelemetry | undefined,
	split: PromptPassTelemetry | undefined,
): ContinuationSynthesisTelemetry | undefined {
	const historyTelemetry = clonePromptPassTelemetry(history);
	const splitTelemetry = clonePromptPassTelemetry(split);
	if (!historyTelemetry && !splitTelemetry) return undefined;
	return {
		history: historyTelemetry,
		split: splitTelemetry,
		...computeSynthesisTotals(historyTelemetry, splitTelemetry),
	};
}

/** Parse the package-owned compaction-entry details payload used by session_compact. */
export function parseContinuationDetails(value: unknown): ContinuationCompactionDetails | undefined {
	if (!isRecord(value) || !hasOnlyKeys(value, CONTINUATION_DETAILS_KEYS)) return undefined;
	if (value.kind !== CONTINUATION_DETAILS_KIND_V4) return undefined;
	if (!isStringArray(value.readFiles) || !isStringArray(value.modifiedFiles)) return undefined;
	if (invalidOptionalString(value.documentSyncId) || invalidOptionalString(value.agentGuideSyncId) || invalidOptionalString(value.agentGuideChangeReason) || invalidOptionalString(value.continuationEventId)) return undefined;
	if (value.agentGuideWriteStatus !== undefined && !asAgentGuideWriteStatus(value.agentGuideWriteStatus)) return undefined;
	const documentSyncId = optionalTrimmedString(value.documentSyncId);
	const agentGuideSyncId = optionalTrimmedString(value.agentGuideSyncId);
	const agentGuideWriteStatus = asAgentGuideWriteStatus(value.agentGuideWriteStatus);
	const agentGuideChangeReason = optionalTrimmedString(value.agentGuideChangeReason);
	const continuationEventId = optionalTrimmedString(value.continuationEventId);
	const synthesis = value.synthesis === undefined ? undefined : parseSynthesisTelemetry(value.synthesis);
	if (value.synthesis !== undefined && !synthesis) return undefined;
	const details: ContinuationCompactionDetails = {
		kind: CONTINUATION_DETAILS_KIND_V4,
		readFiles: value.readFiles,
		modifiedFiles: value.modifiedFiles,
	};
	if (documentSyncId) details.documentSyncId = documentSyncId;
	if (agentGuideSyncId) details.agentGuideSyncId = agentGuideSyncId;
	if (agentGuideWriteStatus) details.agentGuideWriteStatus = agentGuideWriteStatus;
	if (agentGuideChangeReason) details.agentGuideChangeReason = agentGuideChangeReason;
	if (continuationEventId) details.continuationEventId = continuationEventId;
	if (synthesis) details.synthesis = synthesis;
	return details;
}

/** Build current-compaction details without inheriting cumulative path lists from older summaries. */
export function buildContinuationDetails(
	fileOps: FileOperations,
	documentSyncId: string | undefined,
	agentGuideSyncId: string | undefined,
	agentGuideWriteStatus: AgentGuideWriteStatus | undefined,
	agentGuideChangeReason: string | undefined,
	synthesis: ContinuationSynthesisTelemetry | undefined,
	continuationEventId: string | undefined,
): ContinuationCompactionDetails {
	const { readFiles, modifiedFiles } = snapshotFileOperations(fileOps);
	const details: ContinuationCompactionDetails = {
		kind: CONTINUATION_DETAILS_KIND_V4,
		readFiles,
		modifiedFiles,
	};
	if (documentSyncId) details.documentSyncId = documentSyncId;
	if (agentGuideSyncId) details.agentGuideSyncId = agentGuideSyncId;
	if (agentGuideWriteStatus) details.agentGuideWriteStatus = agentGuideWriteStatus;
	if (agentGuideChangeReason) details.agentGuideChangeReason = agentGuideChangeReason;
	if (continuationEventId) details.continuationEventId = continuationEventId;
	if (synthesis) details.synthesis = synthesis;
	return details;
}

function clip(value: string, maxLength: number): string {
	return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}

function renderPromptPassMetadata(telemetry: PromptPassTelemetry | undefined): PromptPassMetadata | undefined {
	if (!telemetry) return undefined;
	return {
		requestedModel: telemetry.requestedModel,
		responseModel: telemetry.responseModel,
		httpStatus: telemetry.httpStatus,
		totalTokens: telemetry.usage.totalTokens,
		costTotal: telemetry.usage.costTotal,
	};
}

function buildSummaryMetadata(details: ContinuationCompactionDetails): ContinuationSummaryMetadata {
	const metadata: ContinuationSummaryMetadata = {
		kind: CONTINUATION_DETAILS_KIND_V4,
		readFileCount: details.readFiles.length,
		modifiedFileCount: details.modifiedFiles.length,
	};
	if (details.documentSyncId) metadata.documentSyncId = details.documentSyncId;
	if (details.agentGuideSyncId) metadata.agentGuideSyncId = details.agentGuideSyncId;
	if (details.agentGuideWriteStatus) metadata.agentGuideWriteStatus = details.agentGuideWriteStatus;
	if (details.agentGuideChangeReason) metadata.agentGuideChangeReason = clip(details.agentGuideChangeReason, 360);
	if (details.continuationEventId) metadata.continuationEventId = details.continuationEventId;
	if (details.synthesis) {
		metadata.synthesis = {
			history: renderPromptPassMetadata(details.synthesis.history),
			split: renderPromptPassMetadata(details.synthesis.split),
			totalCost: details.synthesis.totalCost,
			totalTokens: details.synthesis.totalTokens,
		};
	}
	return metadata;
}

/** Serialize compact, non-path metadata for the visible compaction summary appendix. */
export function renderContinuationDetails(details: ContinuationCompactionDetails): string {
	return `<continuation-compaction-details>\n${JSON.stringify(buildSummaryMetadata(details), null, 2)}\n</continuation-compaction-details>`;
}
