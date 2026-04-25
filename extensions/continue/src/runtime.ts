import type { ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { MidRunGuardTrigger } from "./types.ts";

export const CONTINUE_STATUS_KEY = "pi-continue";
export const CONTINUATION_PROMPT = [
	"Continue from the continuation compaction that was just created.",
	"Use the compaction summary as the primary continuation context.",
	"Follow its Must Read and Start From Here sections before doing broader discovery.",
	"Read repo CONTINUE.md only if the summary is missing details or appears stale.",
	"Treat transcript and tool history as evidence, not replay.",
	"Do not redo completed discovery.",
	"Continue the user's active task from the next concrete step, preserving all constraints and decisions captured in the continuation.",
].join(" ");

export type ContinuationRequestMode = "steer" | "queue";
export type ContinuationRequestSource = "command-steer" | "command-queue" | "mid-run-guard";

export interface ContinuationRuntimeState {
	compactionRunning: boolean;
	guardFailureKey: string | undefined;
}

export interface ContinuationRequest {
	mode: ContinuationRequestMode;
	instructions: string | undefined;
}

export interface StartContinuationCompactionOptions {
	source: ContinuationRequestSource;
	instructions: string | undefined;
	trigger: MidRunGuardTrigger | undefined;
	abortActiveRun: boolean;
	continueAfterComplete: boolean;
	sendContinuation: (prompt: string) => void;
}

const MODE_TOKENS = new Set<string>(["steer", "queue"]);

function isContinuationRequestMode(value: string): value is ContinuationRequestMode {
	return MODE_TOKENS.has(value);
}

function mergeInstructions(parts: (string | undefined)[]): string | undefined {
	const merged = parts
		.map((part) => part?.trim())
		.filter((part): part is string => part !== undefined && part.length > 0)
		.join("\n\n");
	return merged.length > 0 ? merged : undefined;
}

/** Parse the canonical /continue command contract. */
export function parseContinuationRequest(args: string | undefined): ContinuationRequest {
	const trimmed = args?.trim() ?? "";
	if (!trimmed) return { mode: "steer", instructions: undefined };
	const spaceIndex = trimmed.search(/\s/);
	const first = spaceIndex === -1 ? trimmed : trimmed.slice(0, spaceIndex);
	const normalizedFirst = first.toLowerCase();
	if (!isContinuationRequestMode(normalizedFirst)) return { mode: "steer", instructions: trimmed };
	const rest = spaceIndex === -1 ? "" : trimmed.slice(spaceIndex + 1).trim();
	return {
		mode: normalizedFirst,
		instructions: rest.length > 0 ? rest : undefined,
	};
}

export function createContinuationRuntimeState(): ContinuationRuntimeState {
	return {
		compactionRunning: false,
		guardFailureKey: undefined,
	};
}

export function describeGuardTrigger(trigger: MidRunGuardTrigger): string {
	return `${trigger.estimatedTokens.toLocaleString()}/${trigger.contextWindow.toLocaleString()} tokens, threshold ${trigger.thresholdTokens.toLocaleString()}`;
}

export function buildGuardFailureKey(trigger: MidRunGuardTrigger): string {
	return [
		trigger.contextWindow,
		trigger.reserveTokens,
		trigger.thresholdTokens,
		trigger.estimatedTokens,
		trigger.usageTokens,
		trigger.trailingTokens,
		trigger.lastUsageIndex ?? "none",
	].join(":");
}

export function buildGuardInstructions(trigger: MidRunGuardTrigger): string {
	return [
		"Automatic mid-run continuation guard triggered in the awaited pre-provider context hook before Pi allowed another non-aborted model request to proceed.",
		`Estimated context: ${trigger.estimatedTokens} tokens.`,
		`Compaction threshold: ${trigger.thresholdTokens} tokens (${trigger.contextWindow} context window - ${trigger.reserveTokens} reserve).`,
		"Prioritize current state, latest tool results, remaining task intent, file changes, blockers, and exact next steps.",
	].join("\n");
}

function sourceLabel(source: ContinuationRequestSource): string {
	if (source === "command-queue") return "queued /continue";
	if (source === "command-steer") return "/continue steer";
	return "mid-run continuation guard";
}

function notify(ctx: ExtensionContext, message: string, type: "info" | "warning" | "error"): void {
	if (!ctx.hasUI) return;
	ctx.ui.notify(message, type);
}

function setStatus(ctx: ExtensionContext, value: string | undefined): void {
	if (!ctx.hasUI) return;
	ctx.ui.setStatus(CONTINUE_STATUS_KEY, value);
}

function sendContinuationPrompt(ctx: ExtensionContext, label: string, sendContinuation: (prompt: string) => void): void {
	sendContinuation(CONTINUATION_PROMPT);
	notify(ctx, `${label}: continuation prompt sent.`, "info");
}

/** Start the package-owned compaction pipeline once, with visible lifecycle settlement. */
export function startContinuationCompaction(
	ctx: ExtensionContext,
	runtime: ContinuationRuntimeState,
	options: StartContinuationCompactionOptions,
): boolean {
	if (runtime.compactionRunning) {
		if (options.abortActiveRun) ctx.abort();
		notify(ctx, "Continuation compaction is already running.", "warning");
		return false;
	}
	const guardKey = options.trigger ? buildGuardFailureKey(options.trigger) : undefined;
	if (options.source === "mid-run-guard" && guardKey && runtime.guardFailureKey === guardKey) {
		ctx.abort();
		notify(ctx, "Mid-run continuation guard is still blocking an over-threshold request after a failed compaction.", "error");
		setStatus(ctx, "continuation guard blocked retry after failure");
		return false;
	}
	runtime.compactionRunning = true;
	if (options.abortActiveRun) ctx.abort();
	const label = sourceLabel(options.source);
	const triggerText = options.trigger ? ` (${describeGuardTrigger(options.trigger)})` : "";
	setStatus(ctx, `${label}: compacting${triggerText}`);
	notify(ctx, `${label}: starting continuation compaction${triggerText}.`, "info");
	const customInstructions = mergeInstructions([
		options.instructions,
		options.trigger ? buildGuardInstructions(options.trigger) : undefined,
	]);
	ctx.compact({
		customInstructions,
		onComplete: () => {
			runtime.compactionRunning = false;
			runtime.guardFailureKey = undefined;
			if (options.continueAfterComplete) {
				setStatus(ctx, `${label}: sending continuation`);
				sendContinuationPrompt(ctx, label, options.sendContinuation);
			}
			setStatus(ctx, undefined);
			notify(ctx, `${label}: continuation compaction completed.`, "info");
		},
		onError: (error) => {
			runtime.compactionRunning = false;
			if (guardKey) runtime.guardFailureKey = guardKey;
			setStatus(ctx, `${label}: failed`);
			notify(ctx, `${label}: continuation compaction failed: ${error.message}`, "error");
		},
	});
	return true;
}

/** Execute /continue in immediate steer mode or wait-until-idle queue mode. */
export async function runContinuationCommand(
	ctx: ExtensionCommandContext,
	runtime: ContinuationRuntimeState,
	args: string | undefined,
	sendContinuation: (prompt: string) => void,
): Promise<void> {
	const request = parseContinuationRequest(args);
	if (request.mode === "queue") {
		notify(ctx, "Queued continuation compaction for the next idle point.", "info");
		await ctx.waitForIdle();
		startContinuationCompaction(ctx, runtime, {
			source: "command-queue",
			instructions: request.instructions,
			trigger: undefined,
			abortActiveRun: false,
			continueAfterComplete: true,
			sendContinuation,
		});
		return;
	}
	startContinuationCompaction(ctx, runtime, {
		source: "command-steer",
		instructions: request.instructions,
		trigger: undefined,
		abortActiveRun: !ctx.isIdle(),
		continueAfterComplete: true,
		sendContinuation,
	});
}
