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
export type LedgerDisplayMode = "overlay" | "off";
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
	ledgerDisplayMode: LedgerDisplayMode;
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
export type ContinuationArtifactStatus = "pending" | "modeled" | "aborted";
export type ContinuationPromptStatus = "pending" | "sent" | "not-requested" | "failed";
export type ContinuationResumeStatus = "not-requested" | "pending" | "running" | "completed" | "failed" | "aborted";
export type ContinuationSyncStatus = "off" | "pending" | "updated" | "unchanged" | "failed" | "no-replacement";
export type ContinuationDocumentSyncTarget = "continuation-doc" | "agent-guide";

export interface PromptPassUsageTelemetry {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	totalTokens: number;
	costTotal: number;
}

export interface PromptPassTelemetry {
	requestedModel: string;
	responseModel?: string;
	responseId?: string;
	usage: PromptPassUsageTelemetry;
	httpStatus?: number;
}

export interface ContinuationSynthesisTelemetry {
	history?: PromptPassTelemetry;
	split?: PromptPassTelemetry;
	totalCost?: number;
	totalTokens?: number;
}

export interface ContinuationResumeOutcome {
	status: ContinuationResumeStatus;
	startedAt?: number;
	completedAt?: number;
	stopReason?: string;
	requestedModel?: string;
	responseModel?: string;
	failureReason?: string;
}

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
	resume: ContinuationResumeOutcome;
	synthesis?: ContinuationSynthesisTelemetry;
	failureReason?: string;
}

export interface ContinuationEventStore {
	latestEvent: ContinuationLatestEvent | undefined;
	activeEventId: string | undefined;
	nextEventSequence: number;
}

/** Persisted status for whether a compaction attempted a configured agent-guide replacement. */
export type AgentGuideWriteStatus = "sync-off" | "no-replacement" | "replacement-pending";

export type ContinuationCompactionDetailsKind = "pi-continue/v3";

/** Package-owned details saved on Pi compaction entries for lifecycle bookkeeping. */
export interface ContinuationCompactionDetails {
	kind: ContinuationCompactionDetailsKind;
	readFiles: string[];
	modifiedFiles: string[];
	documentSyncId?: string;
	agentGuideSyncId?: string;
	agentGuideWriteStatus?: AgentGuideWriteStatus;
	agentGuideChangeReason?: string;
	continuationEventId?: string;
	synthesis?: ContinuationSynthesisTelemetry;
}

export interface ContinuationLedgerSnapshot {
	eventId: string | undefined;
	compactionEntryId: string;
	content: string;
	capturedAt: number;
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
