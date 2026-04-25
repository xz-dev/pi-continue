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

test("continuation prompt prioritizes continuation routing sections", () => {
	assert.match(CONTINUATION_PROMPT, /Use the compaction summary as the primary continuation context/);
	assert.match(CONTINUATION_PROMPT, /Follow its Must Read and Start From Here sections before doing broader discovery/);
	assert.match(CONTINUATION_PROMPT, /Read repo CONTINUE\.md only if the summary is missing details or appears stale/);
	assert.match(CONTINUATION_PROMPT, /Treat transcript and tool history as evidence, not replay/);
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
	assert.equal(owner.compactOptions.customInstructions, "preserve blockers");
	owner.compactOptions.onComplete({});
	assert.equal(runtime.compactionRunning, false);
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
	owner.compactOptions.onError(new Error("failed"));
	assert.equal(runtime.compactionRunning, false);
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
