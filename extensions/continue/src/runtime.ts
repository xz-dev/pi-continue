import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import {
	beginContinuationEvent,
	finishContinuationEvent,
	isActiveRunningContinuationEvent,
	markContinuationPromptSent,
	markContinuationResumeStarted,
	recordBlockedContinuationEvent,
	sanitizeEventReason,
	settleContinuationResume,
} from "./continuation-event.ts";
import type {
	ContinuationEventSource,
	ContinuationEventStore,
	ContinuationLatestEvent,
	ContinuationLedgerSnapshot,
	ContinuationResumeStatus,
	MidRunGuardTrigger,
} from "./types.ts";
import {
	beginWorkingVisuals,
	settleWorkingVisuals,
} from "./working-ui.ts";

export const CONTINUE_STATUS_KEY = "pi-continue";
export const CONTINUATION_PROMPT = [
	"Continue from the continuation compaction that was just created.",
	"Use the compaction summary as the primary continuation ledger.",
	"Orient from its task, initiative charter, definition of done, recency ledger, current plan, progress trail, current state, decisions, context map, working edge, validation, risks, dormant context, retired context, anti-rework, durable learnings, durable promotions, and agent-guide update notes before broader discovery.",
	"Honor the recency ledger first: newer active user requests and supersession resolutions override older plan or await-direction state.",
	"Resolve every non-none durable promotion through normal repo work before further mutation in the affected repo, unless newer evidence rejects or defers it.",
	"Read repo documents or mapped sources only when the ledger says they unlock a decision, prevent rework, or reduce risk.",
	"Treat AGENTS.md candidate updates as guidance unless the ledger says they were written; candidate notes alone are not writes.",
	"Treat transcript and tool history as evidence, not replay.",
	"Do not redo completed discovery or revive retired facts.",
	"Continue the user's active task from the live working edge while preserving all constraints, decisions, completion criteria, and durable learnings captured in the continuation ledger.",
].join(" ");

export type ContinuationRequestMode = "steer" | "queue";
export type ContinuationRequestSource = ContinuationEventSource;

export interface ContinuationRuntimeState extends ContinuationEventStore {
	compactionRunning: boolean;
	guardFailureKey: string | undefined;
	awaitingResumeEventId: string | undefined;
	resumeStartTimeout: ReturnType<typeof setTimeout> | undefined;
	latestLedger: ContinuationLedgerSnapshot | undefined;
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
	onContinuationFailed?: (eventId: string) => void;
	resumeStartTimeoutMs?: number;
}

export interface ContinuationResumeSettlement {
	eventId: string;
	status: Exclude<ContinuationResumeStatus, "not-requested" | "pending" | "running">;
}

const MODE_TOKENS = new Set<string>(["steer", "queue"]);
const RESUME_START_TIMEOUT_MS = 30_000;

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
		awaitingResumeEventId: undefined,
		resumeStartTimeout: undefined,
		latestLedger: undefined,
		latestEvent: undefined,
		activeEventId: undefined,
		nextEventSequence: 0,
	};
}

/** Return the runtime-local latest event rendered by /continue status. */
export function getLatestContinuationEvent(runtime: ContinuationRuntimeState): ContinuationLatestEvent | undefined {
	return runtime.latestEvent;
}

export function getLatestContinuationLedger(runtime: ContinuationRuntimeState): ContinuationLedgerSnapshot | undefined {
	return runtime.latestLedger;
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

function sendContinuationPrompt(sendContinuation: (prompt: string) => void): void {
	sendContinuation(CONTINUATION_PROMPT);
}

function unrefTimer(timer: ReturnType<typeof setTimeout>): void {
	if (typeof timer === "object" && timer !== null) timer.unref?.();
}

export function clearResumeStartTimeout(runtime: ContinuationRuntimeState): void {
	if (!runtime.resumeStartTimeout) return;
	clearTimeout(runtime.resumeStartTimeout);
	runtime.resumeStartTimeout = undefined;
}

function isAwaitingResumeEventCurrent(runtime: ContinuationRuntimeState): boolean {
	const eventId = runtime.awaitingResumeEventId;
	return eventId !== undefined
		&& runtime.activeEventId === eventId
		&& runtime.latestEvent?.id === eventId
		&& runtime.latestEvent.status === "running";
}

export function clearStaleAwaitingContinuationResume(runtime: ContinuationRuntimeState): void {
	if (runtime.awaitingResumeEventId && !isAwaitingResumeEventCurrent(runtime)) {
		runtime.awaitingResumeEventId = undefined;
		clearResumeStartTimeout(runtime);
	}
}

function hasActiveContinuationAftercare(runtime: ContinuationRuntimeState): boolean {
	clearStaleAwaitingContinuationResume(runtime);
	return runtime.activeEventId !== undefined || runtime.awaitingResumeEventId !== undefined;
}

function settleContinuationFailureVisuals(
	ctx: ExtensionContext,
	runtime: ContinuationRuntimeState,
	eventId: string,
	label: string,
): void {
	settleWorkingVisuals(ctx, runtime, eventId);
	setStatus(ctx, `${label}: failed`);
}

function scheduleResumeStartTimeout(
	ctx: ExtensionContext,
	runtime: ContinuationRuntimeState,
	eventId: string,
	label: string,
	timeoutMs: number,
	onContinuationFailed: ((eventId: string) => void) | undefined,
): void {
	clearResumeStartTimeout(runtime);
	const timeout = setTimeout(() => {
		if (runtime.awaitingResumeEventId !== eventId) return;
		const failedEventId = failAwaitingContinuationResume(
			runtime,
			"Continuation prompt dispatch failed before the next run started.",
		);
		if (!failedEventId) return;
		onContinuationFailed?.(failedEventId);
		settleContinuationFailureVisuals(ctx, runtime, failedEventId, label);
		notify(ctx, `${label}: continuation prompt dispatch failed.`, "error");
	}, Math.max(0, timeoutMs));
	runtime.resumeStartTimeout = timeout;
	unrefTimer(timeout);
}

/** Start the package-owned compaction pipeline once, with visible lifecycle settlement. */
export function startContinuationCompaction(
	ctx: ExtensionContext,
	runtime: ContinuationRuntimeState,
	options: StartContinuationCompactionOptions,
): boolean {
	clearStaleAwaitingContinuationResume(runtime);
	if (runtime.compactionRunning) {
		if (options.abortActiveRun && options.source === "mid-run-guard") ctx.abort();
		notify(ctx, "Continuation compaction is already running.", "warning");
		return false;
	}
	if (hasActiveContinuationAftercare(runtime)) {
		if (options.source === "mid-run-guard" && options.abortActiveRun) ctx.abort();
		notify(ctx, "Continuation aftercare is still settling; no new compaction was started.", "warning");
		setStatus(ctx, "continuation aftercare still settling");
		return false;
	}
	const guardKey = options.trigger ? buildGuardFailureKey(options.trigger) : undefined;
	if (options.source === "mid-run-guard" && guardKey && runtime.guardFailureKey === guardKey) {
		ctx.abort();
		recordBlockedContinuationEvent(
			runtime,
			options.source,
			options.trigger,
			"Mid-run continuation guard blocked a repeated over-threshold retry after the previous compaction failed.",
		);
		notify(ctx, "Mid-run continuation guard is still blocking an over-threshold request after a failed compaction.", "error");
		setStatus(ctx, "continuation guard blocked retry after failure");
		return false;
	}
	runtime.compactionRunning = true;
	const event = beginContinuationEvent(
		runtime,
		options.source,
		options.trigger,
		options.continueAfterComplete ? "pending" : "not-requested",
	);
	beginWorkingVisuals(ctx, runtime, event.id, "pi-continue compacting");
	if (options.abortActiveRun) ctx.abort();
	const label = sourceLabel(options.source);
	const triggerText = options.trigger ? ` (${describeGuardTrigger(options.trigger)})` : "";
	setStatus(ctx, `${label}: compacting${triggerText}`);
	notify(ctx, `${label}: starting continuation compaction${triggerText}.`, "info");
	const customInstructions = mergeInstructions([
		options.instructions,
		options.trigger ? buildGuardInstructions(options.trigger) : undefined,
	]);
	let compactionCallbackSettled = false;
	function claimCompactionCallback(): boolean {
		if (compactionCallbackSettled) return false;
		compactionCallbackSettled = true;
		return isActiveRunningContinuationEvent(runtime, event.id);
	}
	try {
		ctx.compact({
			customInstructions,
			onComplete: () => {
				if (!claimCompactionCallback()) return;
				runtime.compactionRunning = false;
				runtime.guardFailureKey = undefined;
				if (options.continueAfterComplete) {
					setStatus(ctx, `${label}: sending continuation`);
					try {
						sendContinuationPrompt(options.sendContinuation);
						markContinuationPromptSent(runtime, event.id);
						runtime.awaitingResumeEventId = event.id;
						scheduleResumeStartTimeout(
							ctx,
							runtime,
							event.id,
							label,
							options.resumeStartTimeoutMs ?? RESUME_START_TIMEOUT_MS,
							options.onContinuationFailed,
						);
						notify(ctx, `${label}: continuation prompt sent.`, "info");
					} catch (error) {
						const message = error instanceof Error ? error.message : String(error);
						const safeMessage = sanitizeEventReason(message);
						options.onContinuationFailed?.(event.id);
						finishContinuationEvent(runtime, event.id, "failed", safeMessage);
						clearResumeStartTimeout(runtime);
						runtime.awaitingResumeEventId = undefined;
						settleContinuationFailureVisuals(ctx, runtime, event.id, label);
						notify(ctx, `${label}: continuation prompt failed: ${safeMessage}`, "error");
						return;
					}
					return;
				}
				finishContinuationEvent(runtime, event.id, "completed", undefined);
				settleWorkingVisuals(ctx, runtime, event.id);
				setStatus(ctx, undefined);
				notify(ctx, `${label}: continuation compaction completed.`, "info");
			},
			onError: (error) => {
				if (!claimCompactionCallback()) return;
				runtime.compactionRunning = false;
				if (guardKey) runtime.guardFailureKey = guardKey;
				const safeMessage = sanitizeEventReason(error.message);
				options.onContinuationFailed?.(event.id);
				finishContinuationEvent(runtime, event.id, "failed", safeMessage);
				clearResumeStartTimeout(runtime);
				runtime.awaitingResumeEventId = undefined;
				settleContinuationFailureVisuals(ctx, runtime, event.id, label);
				notify(ctx, `${label}: continuation compaction failed: ${safeMessage}`, "error");
			},
		});
	} catch (error) {
		runtime.compactionRunning = false;
		if (guardKey) runtime.guardFailureKey = guardKey;
		const message = error instanceof Error ? error.message : String(error);
		const safeMessage = sanitizeEventReason(message);
		options.onContinuationFailed?.(event.id);
		finishContinuationEvent(runtime, event.id, "failed", safeMessage);
		clearResumeStartTimeout(runtime);
		runtime.awaitingResumeEventId = undefined;
		settleContinuationFailureVisuals(ctx, runtime, event.id, label);
		notify(ctx, `${label}: continuation compaction failed: ${safeMessage}`, "error");
		return false;
	}
	return true;
}

export function markAwaitingContinuationResumeStarted(runtime: ContinuationRuntimeState): string | undefined {
	clearStaleAwaitingContinuationResume(runtime);
	const eventId = runtime.awaitingResumeEventId;
	if (!eventId) return undefined;
	if (!markContinuationResumeStarted(runtime, eventId)) return undefined;
	clearResumeStartTimeout(runtime);
	return eventId;
}

function requestedAssistantModel(message: AssistantMessage): string {
	return `${message.provider}/${message.model}`;
}

export function settleAwaitingContinuationResumeFromAssistant(
	runtime: ContinuationRuntimeState,
	message: AssistantMessage,
): ContinuationResumeSettlement | undefined {
	clearStaleAwaitingContinuationResume(runtime);
	const eventId = runtime.awaitingResumeEventId;
	if (!eventId || runtime.latestEvent?.id !== eventId || runtime.latestEvent.resume.status !== "running") return undefined;
	if (message.stopReason === "stop" || message.stopReason === "toolUse") {
		if (settleContinuationResume(runtime, eventId, "completed", {
			stopReason: message.stopReason,
			requestedModel: requestedAssistantModel(message),
			responseModel: message.responseModel,
		})) {
			clearResumeStartTimeout(runtime);
			runtime.awaitingResumeEventId = undefined;
			return { eventId, status: "completed" };
		}
		return undefined;
	}
	if (message.stopReason === "aborted") {
		if (settleContinuationResume(runtime, eventId, "aborted", {
			stopReason: message.stopReason,
			requestedModel: requestedAssistantModel(message),
			responseModel: message.responseModel,
			failureReason: "Continuation resume was aborted.",
		})) {
			clearResumeStartTimeout(runtime);
			runtime.awaitingResumeEventId = undefined;
			return { eventId, status: "aborted" };
		}
		return undefined;
	}
	const reason = message.stopReason === "length"
		? "Continuation resume length limit reached."
		: message.errorMessage ?? "Continuation resume assistant response failed.";
	if (settleContinuationResume(runtime, eventId, "failed", {
		stopReason: message.stopReason,
		requestedModel: requestedAssistantModel(message),
		responseModel: message.responseModel,
		failureReason: reason,
	})) {
		clearResumeStartTimeout(runtime);
		runtime.awaitingResumeEventId = undefined;
		return { eventId, status: "failed" };
	}
	return undefined;
}

export function failAwaitingContinuationResume(runtime: ContinuationRuntimeState, reason: string): string | undefined {
	clearStaleAwaitingContinuationResume(runtime);
	const eventId = runtime.awaitingResumeEventId;
	if (!eventId) return undefined;
	if (!settleContinuationResume(runtime, eventId, "failed", { failureReason: reason })) return undefined;
	clearResumeStartTimeout(runtime);
	runtime.awaitingResumeEventId = undefined;
	return eventId;
}

export function failRunningAwaitingContinuationResume(
	runtime: ContinuationRuntimeState,
	reason: string,
): ContinuationResumeSettlement | undefined {
	clearStaleAwaitingContinuationResume(runtime);
	const eventId = runtime.awaitingResumeEventId;
	if (!eventId || runtime.latestEvent?.id !== eventId || runtime.latestEvent.resume.status !== "running") return undefined;
	if (!settleContinuationResume(runtime, eventId, "failed", { failureReason: reason })) return undefined;
	clearResumeStartTimeout(runtime);
	runtime.awaitingResumeEventId = undefined;
	return { eventId, status: "failed" };
}

/** Execute /continue in immediate steer mode or wait-until-idle queue mode. */
export async function runContinuationCommand(
	ctx: ExtensionCommandContext,
	runtime: ContinuationRuntimeState,
	args: string | undefined,
	sendContinuation: (prompt: string) => void,
	onContinuationFailed?: (eventId: string) => void,
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
			onContinuationFailed,
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
		onContinuationFailed,
	});
}
