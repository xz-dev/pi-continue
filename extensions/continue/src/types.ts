export type ContinuationReasoning =
	| "inherit"
	| "off"
	| "minimal"
	| "low"
	| "medium"
	| "high"
	| "xhigh";

export type PromptOverridePolicy = "package-default" | "global-override" | "project-override";
export type ContinuationDocSyncMode = "always" | "off";
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
	continuationDocSyncMode: ContinuationDocSyncMode;
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
}

export interface ContinuationCompactionDetails {
	kind: "pi-continue/v1";
	readFiles: string[];
	modifiedFiles: string[];
	documentSyncId?: string;
}

export interface PendingDocumentWrite {
	continuationDocPath: string;
	content: string;
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
