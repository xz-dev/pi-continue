import test from "node:test";
import assert from "node:assert/strict";
import {
	CONTINUATION_PROMPT,
	createContinuationRuntimeState,
	failRunningAwaitingContinuationResume,
	markAwaitingContinuationResumeStarted,
	parseContinuationRequest,
	runContinuationCommand,
	settleAwaitingContinuationResumeFromAssistant,
	startContinuationCompaction,
} from "../extensions/continue/src/runtime.ts";

function createContext(idle = true) {
	let compactOptions;
	return {
		aborts: 0,
		waits: 0,
		get compactOptions() {
			return compactOptions;
		},
		ctx: {
			hasUI: false,
			ui: {
				notify() {},
				setStatus() {},
			},
			isIdle() {
				return idle;
			},
			abort() {
				this.owner.aborts++;
			},
			compact(options) {
				compactOptions = options;
			},
			async waitForIdle() {
				this.owner.waits++;
			},
			owner: undefined,
		},
	};
}

function bindContext(owner) {
	owner.ctx.owner = owner;
	return owner.ctx;
}

const trigger = {
	estimatedTokens: 120,
	thresholdTokens: 100,
	contextWindow: 128,
	reserveTokens: 28,
	usageTokens: 90,
	trailingTokens: 30,
	lastUsageIndex: 3,
};

test("continuation prompt prioritizes structured continuation ledger routing", () => {
	assert.match(CONTINUATION_PROMPT, /Use the compaction summary as the primary continuation ledger/);
	assert.match(CONTINUATION_PROMPT, /initiative charter, definition of done, recency ledger, current plan, progress trail/);
	assert.match(CONTINUATION_PROMPT, /Honor the recency ledger first/);
	assert.match(CONTINUATION_PROMPT, /newer active user requests and supersession resolutions override older plan/);
	assert.match(CONTINUATION_PROMPT, /dormant context, retired context, anti-rework, durable learnings, durable promotions/);
	assert.match(CONTINUATION_PROMPT, /Resolve every non-none durable promotion/);
	assert.match(CONTINUATION_PROMPT, /Read repo documents or mapped sources only when the ledger says they unlock a decision/);
	assert.match(CONTINUATION_PROMPT, /Treat AGENTS\.md candidate updates as guidance/);
	assert.match(CONTINUATION_PROMPT, /Treat transcript and tool history as evidence, not replay/);
	assert.doesNotMatch(CONTINUATION_PROMPT, /Read Before Acting/);
	assert.doesNotMatch(CONTINUATION_PROMPT, /Resume Now/);
	assert.doesNotMatch(CONTINUATION_PROMPT, /repo CONTINUE\.md as the authoritative continuation context/);
});

test("parseContinuationRequest defaults to steer and preserves instructions", () => {
	assert.deepEqual(parseContinuationRequest(undefined), { mode: "steer", instructions: undefined });
	assert.deepEqual(parseContinuationRequest(""), { mode: "steer", instructions: undefined });
	assert.deepEqual(parseContinuationRequest("queue preserve state"), { mode: "queue", instructions: "preserve state" });
	assert.deepEqual(parseContinuationRequest("steer focus auth"), { mode: "steer", instructions: "focus auth" });
	assert.deepEqual(parseContinuationRequest("now focus auth"), { mode: "steer", instructions: "now focus auth" });
});

test("startContinuationCompaction aborts active runs and sends continuation on completion", () => {
	const owner = createContext(false);
	const ctx = bindContext(owner);
	const runtime = createContinuationRuntimeState();
	const continuations = [];
	const started = startContinuationCompaction(ctx, runtime, {
		source: "command-steer",
		instructions: "preserve blockers",
		trigger: undefined,
		abortActiveRun: true,
		continueAfterComplete: true,
		sendContinuation: (prompt) => continuations.push(prompt),
	});
	assert.equal(started, true);
	assert.equal(owner.aborts, 1);
	assert.equal(runtime.compactionRunning, true);
	assert.equal(runtime.latestEvent?.source, "command-steer");
	assert.equal(runtime.latestEvent?.status, "running");
	assert.equal(runtime.latestEvent?.artifactStatus, "pending");
	assert.equal(owner.compactOptions.customInstructions, "preserve blockers");
	owner.compactOptions.onComplete({});
	assert.equal(runtime.compactionRunning, false);
	assert.equal(runtime.latestEvent?.status, "running");
	assert.equal(runtime.latestEvent?.promptStatus, "sent");
	assert.equal(runtime.latestEvent?.resume.status, "pending");
	assert.deepEqual(continuations, [CONTINUATION_PROMPT]);
	assert.equal(markAwaitingContinuationResumeStarted(runtime), "continue-1");
	settleAwaitingContinuationResumeFromAssistant(runtime, {
		role: "assistant",
		provider: "openai",
		model: "gpt-test",
		content: [{ type: "text", text: "continuing" }],
		usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
		stopReason: "stop",
		timestamp: 0,
	});
	assert.equal(runtime.latestEvent?.status, "completed");
	assert.equal(runtime.latestEvent?.resume.status, "completed");
	assert.equal(runtime.activeEventId, undefined);
});

test("stale assistant message_end cannot settle resume before start proof", () => {
	const owner = createContext(true);
	const ctx = bindContext(owner);
	const runtime = createContinuationRuntimeState();
	const continuations = [];
	const started = startContinuationCompaction(ctx, runtime, {
		source: "command-steer",
		instructions: undefined,
		trigger: undefined,
		abortActiveRun: false,
		continueAfterComplete: true,
		sendContinuation: (prompt) => continuations.push(prompt),
	});
	assert.equal(started, true);
	owner.compactOptions.onComplete({});
	const stale = settleAwaitingContinuationResumeFromAssistant(runtime, {
		role: "assistant",
		provider: "openai",
		model: "gpt-test",
		content: [{ type: "text", text: "stale" }],
		usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
		stopReason: "stop",
		timestamp: 0,
	});
	assert.equal(stale, undefined);
	assert.equal(runtime.latestEvent?.status, "running");
	assert.equal(runtime.latestEvent?.resume.status, "pending");
	assert.equal(runtime.awaitingResumeEventId, "continue-1");
});

test("agent-end resume failure requires start proof", () => {
	const owner = createContext(true);
	const ctx = bindContext(owner);
	const runtime = createContinuationRuntimeState();
	const continuations = [];
	const started = startContinuationCompaction(ctx, runtime, {
		source: "command-steer",
		instructions: undefined,
		trigger: undefined,
		abortActiveRun: false,
		continueAfterComplete: true,
		sendContinuation: (prompt) => continuations.push(prompt),
	});
	assert.equal(started, true);
	owner.compactOptions.onComplete({});
	assert.equal(failRunningAwaitingContinuationResume(runtime, "Continuation resume did not produce an assistant response."), undefined);
	assert.equal(runtime.latestEvent?.status, "running");
	assert.equal(markAwaitingContinuationResumeStarted(runtime), "continue-1");
	const settlement = failRunningAwaitingContinuationResume(runtime, "Continuation resume did not produce an assistant response.");
	assert.deepEqual(settlement, { eventId: "continue-1", status: "failed" });
	assert.equal(runtime.latestEvent?.status, "failed");
	assert.equal(runtime.latestEvent?.resume.status, "failed");
	assert.equal(runtime.latestEvent?.resume.failureReason, "Continuation resume did not produce an assistant response.");
	assert.equal(runtime.awaitingResumeEventId, undefined);
});

test("mid-run guard aborts over-threshold request while compaction is already running", () => {
	const owner = createContext(true);
	const ctx = bindContext(owner);
	const runtime = createContinuationRuntimeState();
	const continuations = [];
	const first = startContinuationCompaction(ctx, runtime, {
		source: "command-steer",
		instructions: undefined,
		trigger: undefined,
		abortActiveRun: false,
		continueAfterComplete: true,
		sendContinuation: (prompt) => continuations.push(prompt),
	});
	assert.equal(first, true);
	const guard = startContinuationCompaction(ctx, runtime, {
		source: "mid-run-guard",
		instructions: undefined,
		trigger,
		abortActiveRun: true,
		continueAfterComplete: true,
		sendContinuation: (prompt) => continuations.push(prompt),
	});
	assert.equal(guard, false);
	assert.equal(owner.aborts, 1);
	assert.equal(runtime.latestEvent?.id, "continue-1");
	assert.equal(runtime.compactionRunning, true);
	assert.equal(continuations.length, 0);
});

test("pending resume blocks new continuation without clobbering aftercare", () => {
	const owner = createContext(true);
	const ctx = bindContext(owner);
	const runtime = createContinuationRuntimeState();
	const continuations = [];
	const first = startContinuationCompaction(ctx, runtime, {
		source: "command-steer",
		instructions: undefined,
		trigger: undefined,
		abortActiveRun: false,
		continueAfterComplete: true,
		sendContinuation: (prompt) => continuations.push(prompt),
	});
	assert.equal(first, true);
	owner.compactOptions.onComplete({});
	assert.equal(runtime.activeEventId, "continue-1");
	assert.equal(runtime.awaitingResumeEventId, "continue-1");
	const second = startContinuationCompaction(ctx, runtime, {
		source: "command-steer",
		instructions: undefined,
		trigger: undefined,
		abortActiveRun: true,
		continueAfterComplete: true,
		sendContinuation: (prompt) => continuations.push(prompt),
	});
	assert.equal(second, false);
	assert.equal(owner.aborts, 0);
	assert.equal(runtime.latestEvent?.id, "continue-1");
	assert.equal(runtime.activeEventId, "continue-1");
	assert.equal(runtime.awaitingResumeEventId, "continue-1");
	assert.equal(continuations.length, 1);
});

test("mid-run guard aborts over-threshold request while preserving pending aftercare", () => {
	const owner = createContext(true);
	const ctx = bindContext(owner);
	const runtime = createContinuationRuntimeState();
	const continuations = [];
	const first = startContinuationCompaction(ctx, runtime, {
		source: "command-steer",
		instructions: undefined,
		trigger: undefined,
		abortActiveRun: false,
		continueAfterComplete: true,
		sendContinuation: (prompt) => continuations.push(prompt),
	});
	assert.equal(first, true);
	owner.compactOptions.onComplete({});
	const guard = startContinuationCompaction(ctx, runtime, {
		source: "mid-run-guard",
		instructions: undefined,
		trigger,
		abortActiveRun: true,
		continueAfterComplete: true,
		sendContinuation: (prompt) => continuations.push(prompt),
	});
	assert.equal(guard, false);
	assert.equal(owner.aborts, 1);
	assert.equal(runtime.latestEvent?.id, "continue-1");
	assert.equal(runtime.latestEvent?.status, "running");
	assert.equal(runtime.latestEvent?.resume.status, "pending");
	assert.equal(runtime.awaitingResumeEventId, "continue-1");
	assert.equal(continuations.length, 1);
});

test("duplicate compaction terminal callbacks cannot double-send or fail pending resume", () => {
	const owner = createContext(true);
	const ctx = bindContext(owner);
	const runtime = createContinuationRuntimeState();
	const continuations = [];
	const failedEvents = [];
	const started = startContinuationCompaction(ctx, runtime, {
		source: "command-steer",
		instructions: undefined,
		trigger: undefined,
		abortActiveRun: false,
		continueAfterComplete: true,
		sendContinuation: (prompt) => continuations.push(prompt),
		onContinuationFailed: (eventId) => failedEvents.push(eventId),
	});
	assert.equal(started, true);
	owner.compactOptions.onComplete({});
	owner.compactOptions.onComplete({});
	owner.compactOptions.onError(new Error("provider failed"));
	assert.deepEqual(continuations, [CONTINUATION_PROMPT]);
	assert.deepEqual(failedEvents, []);
	assert.equal(runtime.latestEvent?.status, "running");
	assert.equal(runtime.latestEvent?.promptStatus, "sent");
	assert.equal(runtime.latestEvent?.resume.status, "pending");
	assert.equal(runtime.activeEventId, "continue-1");
});

test("resume start timeout settles prompt dispatch that never starts", async () => {
	const owner = createContext(true);
	const ctx = bindContext(owner);
	const runtime = createContinuationRuntimeState();
	const failedEvents = [];
	const continuations = [];
	const started = startContinuationCompaction(ctx, runtime, {
		source: "command-steer",
		instructions: undefined,
		trigger: undefined,
		abortActiveRun: false,
		continueAfterComplete: true,
		sendContinuation: (prompt) => continuations.push(prompt),
		onContinuationFailed: (eventId) => failedEvents.push(eventId),
		resumeStartTimeoutMs: 0,
	});
	assert.equal(started, true);
	owner.compactOptions.onComplete({});
	await new Promise((resolve) => setTimeout(resolve, 0));
	assert.deepEqual(continuations, [CONTINUATION_PROMPT]);
	assert.deepEqual(failedEvents, ["continue-1"]);
	assert.equal(runtime.latestEvent?.status, "failed");
	assert.equal(runtime.latestEvent?.resume.status, "failed");
	assert.equal(runtime.latestEvent?.failureReason, "Continuation prompt dispatch failed before the next run started.");
	assert.equal(runtime.activeEventId, undefined);
	assert.equal(runtime.awaitingResumeEventId, undefined);
});

test("failed guard records a failure key and blocks identical retries", () => {
	const owner = createContext(false);
	const ctx = bindContext(owner);
	const runtime = createContinuationRuntimeState();
	const continuations = [];
	const started = startContinuationCompaction(ctx, runtime, {
		source: "mid-run-guard",
		instructions: undefined,
		trigger,
		abortActiveRun: true,
		continueAfterComplete: true,
		sendContinuation: (prompt) => continuations.push(prompt),
	});
	assert.equal(started, true);
	owner.compactOptions.onError(new Error("compact failed"));
	assert.equal(runtime.compactionRunning, false);
	assert.equal(runtime.latestEvent?.status, "failed");
	assert.equal(runtime.latestEvent?.failureReason, "Continuation compaction failed.");
	assert.equal(continuations.length, 0);
	const retry = startContinuationCompaction(ctx, runtime, {
		source: "mid-run-guard",
		instructions: undefined,
		trigger,
		abortActiveRun: true,
		continueAfterComplete: true,
		sendContinuation: (prompt) => continuations.push(prompt),
	});
	assert.equal(retry, false);
	assert.equal(owner.aborts, 2);
	assert.equal(runtime.latestEvent?.status, "blocked");
	assert.equal(runtime.latestEvent?.failureReason, "Repeated over-threshold retry was blocked after a failed compaction.");
});

test("prompt dispatch failure settles the latest event", () => {
	const owner = createContext(true);
	const ctx = bindContext(owner);
	const runtime = createContinuationRuntimeState();
	const started = startContinuationCompaction(ctx, runtime, {
		source: "command-steer",
		instructions: undefined,
		trigger: undefined,
		abortActiveRun: false,
		continueAfterComplete: true,
		sendContinuation: () => {
			throw new Error("send failed");
		},
	});
	assert.equal(started, true);
	owner.compactOptions.onComplete({});
	assert.equal(runtime.compactionRunning, false);
	assert.equal(runtime.activeEventId, undefined);
	assert.equal(runtime.latestEvent?.status, "failed");
	assert.equal(runtime.latestEvent?.promptStatus, "failed");
	assert.equal(runtime.latestEvent?.failureReason, "Continuation prompt dispatch failed.");
});

test("duplicate terminal callbacks do not revive failed events", () => {
	const owner = createContext(false);
	const ctx = bindContext(owner);
	const runtime = createContinuationRuntimeState();
	const continuations = [];
	const started = startContinuationCompaction(ctx, runtime, {
		source: "mid-run-guard",
		instructions: undefined,
		trigger,
		abortActiveRun: true,
		continueAfterComplete: true,
		sendContinuation: (prompt) => continuations.push(prompt),
	});
	assert.equal(started, true);
	owner.compactOptions.onError(new Error("provider failed"));
	owner.compactOptions.onComplete({});
	assert.equal(runtime.latestEvent?.status, "failed");
	assert.equal(runtime.latestEvent?.promptStatus, "failed");
	assert.equal(continuations.length, 0);
});

test("compaction failures call the pending-write cleanup hook", () => {
	const owner = createContext(true);
	const ctx = bindContext(owner);
	const runtime = createContinuationRuntimeState();
	const failedEvents = [];
	const started = startContinuationCompaction(ctx, runtime, {
		source: "command-steer",
		instructions: undefined,
		trigger: undefined,
		abortActiveRun: false,
		continueAfterComplete: true,
		sendContinuation: () => {},
		onContinuationFailed: (eventId) => failedEvents.push(eventId),
	});
	assert.equal(started, true);
	owner.compactOptions.onError(new Error("permission denied"));
	assert.deepEqual(failedEvents, ["continue-1"]);
});

test("runContinuationCommand queue waits for idle before compaction", async () => {
	const owner = createContext(false);
	const ctx = bindContext(owner);
	const runtime = createContinuationRuntimeState();
	const continuations = [];
	await runContinuationCommand(ctx, runtime, "queue finish validation", (prompt) => continuations.push(prompt));
	assert.equal(owner.waits, 1);
	assert.equal(owner.aborts, 0);
	assert.equal(owner.compactOptions.customInstructions, "finish validation");
	owner.compactOptions.onComplete({});
	assert.deepEqual(continuations, [CONTINUATION_PROMPT]);
});
