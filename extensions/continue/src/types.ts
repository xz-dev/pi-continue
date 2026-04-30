export type ContinuationReasoning =
	| "inherit"
	| "off"
	| "minimal"
	| "low"
	| "medium"
	| "high"
	| "xhigh";

export type PromptOverridePolicy = "package-default" | "global-override" | "project-override";
export type DocumentSyncMode = "always" | "off";
export type FallbackMode = "deterministic-summary" | "abort";
export type ConfigScope = "global" | "project";
export type HistoryScenario = "initial" | "update";

export interface ContinuationConfig {
	enabled: boolean;
	summarizerModel: string;
	reasoning: ContinuationReasoning;
	historyMaxTokens: number | null;
	splitPrefixMaxTokens: number | null;
	continuationDocPath: string;
	continuationDocSyncMode: DocumentSyncMode;
	agentGuidePath: string;
	agentGuideSyncMode: DocumentSyncMode;
	midRunGuardEnabled: boolean;
	appendCompactionMetadata: boolean;
	appendFileTags: boolean;
	promptOverridePolicy: PromptOverridePolicy;
	fallbackMode: FallbackMode;
}

export interface ResolvedProjectContext {
	projectRoot: string;
	continuationDocPath: string;
	existingContinuationDoc: string | undefined;
	agentGuidePath: string;
	existingAgentGuide: string | undefined;
}

export interface LoadedPromptAsset {
	content: string;
	sourcePath: string;
}

export interface HistoryPromptAssets {
	system: LoadedPromptAsset;
	baseUser: LoadedPromptAsset;
	scenarioUser: LoadedPromptAsset;
}

export interface SplitPromptAssets {
	system: LoadedPromptAsset;
	scenarioUser: LoadedPromptAsset;
}

export interface FileOpsSnapshot {
	readFiles: string[];
	modifiedFiles: string[];
}

export interface HistoryPromptInput {
	scenario: HistoryScenario;
	projectRoot: string;
	continuationDocPath: string;
	existingContinuationDoc: string | undefined;
	agentGuidePath: string;
	existingAgentGuide: string | undefined;
	previousSummary: string | undefined;
	historyTranscript: string;
	customInstructions: string | undefined;
	fileOps: FileOpsSnapshot;
}

export interface SplitPromptInput {
	projectRoot: string;
	continuationDocPath: string;
	splitPrefixTranscript: string;
	customInstructions: string | undefined;
}

export interface CompiledPrompt {
	systemPrompt: string;
	userPrompt: string;
	sources: {
		system: string;
		baseUser?: string;
		scenarioUser: string;
	};
}

export interface ParsedHistoryArtifacts {
	continuation: string;
	continuationMd: string;
	agentGuideMd: string | undefined;
	agentGuideChangeReason: string;
}

export type ContinuationEventSource = "command-steer" | "command-queue" | "mid-run-guard";
export type ContinuationEventStatus = "running" | "completed" | "failed" | "blocked";
export type ContinuationArtifactStatus = "pending" | "modeled" | "fallback" | "aborted";
export type ContinuationPromptStatus = "pending" | "sent" | "not-requested" | "failed";
export type ContinuationSyncStatus = "off" | "pending" | "updated" | "unchanged" | "failed" | "no-replacement";
export type ContinuationDocumentSyncTarget = "continuation-doc" | "agent-guide";

export interface ContinuationDocumentSyncStatus {
	continuationDoc: ContinuationSyncStatus;
	agentGuide: ContinuationSyncStatus;
}

/** Latest operator-facing continuation lifecycle snapshot. It stores no transcript or document content. */
export interface ContinuationLatestEvent {
	id: string;
	source: ContinuationEventSource;
	status: ContinuationEventStatus;
	startedAt: number;
	completedAt?: number;
	trigger?: MidRunGuardTrigger;
	artifactStatus: ContinuationArtifactStatus;
	promptStatus: ContinuationPromptStatus;
	documentSync: ContinuationDocumentSyncStatus;
	failureReason?: string;
}

export interface ContinuationEventStore {
	latestEvent: ContinuationLatestEvent | undefined;
	activeEventId: string | undefined;
	nextEventSequence: number;
}

/** Persisted status for whether a compaction attempted an AGENTS.md replacement. */
export type AgentGuideWriteStatus = "sync-off" | "no-replacement" | "replacement-pending";

/** Package-owned details saved on Pi compaction entries for lifecycle bookkeeping. */
export interface ContinuationCompactionDetails {
	kind: "pi-continue/v2";
	readFiles: string[];
	modifiedFiles: string[];
	documentSyncId?: string;
	agentGuideSyncId?: string;
	agentGuideWriteStatus?: AgentGuideWriteStatus;
	agentGuideChangeReason?: string;
}

export interface PendingDocumentWrite {
	path: string;
	content: string;
	label: string;
	target: ContinuationDocumentSyncTarget;
	eventId: string | undefined;
}

export interface PiCompactionSettings {
	enabled: boolean;
	reserveTokens: number;
	keepRecentTokens: number;
}

export interface PreviewPayload {
	history: CompiledPrompt;
	split: CompiledPrompt | undefined;
	scenario: HistoryScenario;
	isSplitTurn: boolean;
}

export interface ContextUsageEstimateSnapshot {
	tokens: number;
	usageTokens: number;
	trailingTokens: number;
	lastUsageIndex: number | null;
}

export interface MidRunGuardTrigger {
	estimatedTokens: number;
	thresholdTokens: number;
	contextWindow: number;
	reserveTokens: number;
	usageTokens: number;
	trailingTokens: number;
	lastUsageIndex: number | null;
}
