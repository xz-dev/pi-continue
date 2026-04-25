import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { DEFAULT_CONTINUE_CONFIG, loadContinuationConfig } from "./config.ts";
import { readEffectivePiCompactionSettings } from "./pi-settings.ts";
import { loadPiInternals } from "./pi-internals.ts";
import { resolveProjectContext } from "./project.ts";
import { startContinuationCompaction, type ContinuationRuntimeState } from "./runtime.ts";
import type {
	ContextUsageEstimateSnapshot,
	ContinuationConfig,
	MidRunGuardTrigger,
	PiCompactionSettings,
} from "./types.ts";

export interface MidRunGuardDecisionInput {
	config: ContinuationConfig;
	piSettings: PiCompactionSettings;
	contextWindow: number | undefined;
	estimate: ContextUsageEstimateSnapshot;
}

function isMessageRecord(value: unknown): value is { role: unknown } {
	return typeof value === "object" && value !== null && "role" in value;
}

function messageRole(value: unknown): string | undefined {
	if (!isMessageRecord(value)) return undefined;
	return typeof value.role === "string" ? value.role : undefined;
}

function endsWithContiguousToolResultSuffix(messages: unknown[]): boolean {
	if (messageRole(messages[messages.length - 1]) !== "toolResult") return false;
	let index = messages.length - 1;
	while (index >= 0 && messageRole(messages[index]) === "toolResult") {
		index--;
	}
	return messageRole(messages[index]) === "assistant";
}

function hasUsableContextWindow(contextWindow: number | undefined, reserveTokens: number): contextWindow is number {
	return contextWindow !== undefined && Number.isFinite(contextWindow) && contextWindow > reserveTokens;
}

/** Decide whether a pre-provider context belongs to a completed assistant/tool-result loop. */
export function shouldEvaluateMidRunContext(messages: unknown[]): boolean {
	return endsWithContiguousToolResultSuffix(messages);
}

/** Decide whether the package must stop before Pi sends another provider request. */
export function decideMidRunGuardTrigger(input: MidRunGuardDecisionInput): MidRunGuardTrigger | undefined {
	if (!input.config.enabled || !input.config.midRunGuardEnabled || !input.piSettings.enabled) return undefined;
	if (!hasUsableContextWindow(input.contextWindow, input.piSettings.reserveTokens)) return undefined;
	const thresholdTokens = input.contextWindow - input.piSettings.reserveTokens;
	if (input.estimate.tokens <= thresholdTokens) return undefined;
	return {
		estimatedTokens: input.estimate.tokens,
		thresholdTokens,
		contextWindow: input.contextWindow,
		reserveTokens: input.piSettings.reserveTokens,
		usageTokens: input.estimate.usageTokens,
		trailingTokens: input.estimate.trailingTokens,
		lastUsageIndex: input.estimate.lastUsageIndex,
	};
}

/** Evaluate the awaited pre-provider guard after a complete assistant/tool-result batch. */
export async function runMidRunGuard(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	runtime: ContinuationRuntimeState,
	messages: unknown[],
): Promise<void> {
	if (!shouldEvaluateMidRunContext(messages) || !ctx.model || runtime.compactionRunning) return;
	const initialProjectContext = await resolveProjectContext(pi, ctx.cwd, DEFAULT_CONTINUE_CONFIG.continuationDocPath);
	const config = loadContinuationConfig(initialProjectContext.projectRoot);
	if (!config.enabled || !config.midRunGuardEnabled) return;
	const piSettings = readEffectivePiCompactionSettings(initialProjectContext.projectRoot);
	const internals = await loadPiInternals();
	const estimate = internals.estimateContextTokens(messages);
	const trigger = decideMidRunGuardTrigger({
		config,
		piSettings,
		contextWindow: ctx.model.contextWindow,
		estimate,
	});
	if (!trigger) return;
	startContinuationCompaction(ctx, runtime, {
		source: "mid-run-guard",
		instructions: undefined,
		trigger,
		abortActiveRun: true,
		continueAfterComplete: true,
		sendContinuation: (prompt) => pi.sendUserMessage(prompt),
	});
}
