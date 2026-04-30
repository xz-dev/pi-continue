import test from "node:test";
import assert from "node:assert/strict";
import {
	CONTINUATION_PROMPT,
	createContinuationRuntimeState,
	parseContinuationRequest,
	runContinuationCommand,
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
	assert.equal(runtime.latestEvent?.status, "completed");
	assert.equal(runtime.latestEvent?.promptStatus, "sent");
	assert.deepEqual(continuations, [CONTINUATION_PROMPT]);
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
	owner.compactOptions.onError(new Error("Provider failed sk-secret-token"));
	assert.equal(runtime.compactionRunning, false);
	assert.equal(runtime.latestEvent?.status, "failed");
	assert.equal(runtime.latestEvent?.failureReason, "Summarizer provider failed; check model, authentication, or context settings.");
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
			throw new Error("OPENAI_API_KEY=secretvalue");
		},
	});
	assert.equal(started, true);
	owner.compactOptions.onComplete({});
	assert.equal(runtime.compactionRunning, false);
	assert.equal(runtime.activeEventId, undefined);
	assert.equal(runtime.latestEvent?.status, "failed");
	assert.equal(runtime.latestEvent?.promptStatus, "failed");
	assert.equal(runtime.latestEvent?.failureReason, "Summarizer provider failed; check model, authentication, or context settings.");
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
