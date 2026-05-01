import test from "node:test";
import assert from "node:assert/strict";
import registerContinueExtension from "../extensions/continue/index.ts";
import { CONTINUATION_PROMPT } from "../extensions/continue/src/runtime.ts";

function assistantMessage(stopReason = "stop") {
	return {
		role: "assistant",
		provider: "openai",
		model: "gpt-test",
		content: [{ type: "text", text: "continuing" }],
		usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
		stopReason,
		timestamp: 0,
	};
}

function createFakePi(cwd) {
	const commands = new Map();
	const events = new Map();
	const sent = [];
	return {
		commands,
		events,
		sent,
		registerCommand(name, command) {
			commands.set(name, command);
		},
		on(name, handler) {
			events.set(name, handler);
		},
		sendUserMessage(prompt) {
			sent.push(prompt);
		},
		getThinkingLevel() {
			return undefined;
		},
		async exec(command, args, options) {
			assert.equal(command, "git");
			assert.deepEqual(args, ["rev-parse", "--show-toplevel"]);
			return { stdout: options?.cwd ?? cwd, code: 0 };
		},
	};
}

function createCommandContext(cwd, custom) {
	let compactCount = 0;
	let compactOptions;
	const statusCalls = [];
	const ctx = {
		cwd,
		hasUI: true,
		model: { provider: "openai", id: "gpt-test", contextWindow: 128000 },
		modelRegistry: { getAvailable() { return []; } },
		sessionManager: { getBranch() { return []; } },
		ui: {
			theme: { fg(_color, text) { return text; }, bold(text) { return text; } },
			async custom(factory, options) {
				return custom(factory, options);
			},
			notify() {},
			setStatus(_key, value) {
				statusCalls.push(value);
			},
			setWorkingMessage() {},
			setWorkingIndicator() {},
			getEditorComponent() {
				return undefined;
			},
			setEditorComponent() {},
			async editor() {},
			async select() { return undefined; },
			async input() { return undefined; },
			async confirm() { return false; },
		},
		getContextUsage() {
			return { tokens: 1000, percent: 1, contextWindow: 128000 };
		},
		isIdle() {
			return true;
		},
		abort() {},
		compact(options) {
			compactCount += 1;
			compactOptions = options;
		},
		async waitForIdle() {},
		get compactCount() {
			return compactCount;
		},
		get compactOptions() {
			return compactOptions;
		},
		statusCalls,
	};
	return ctx;
}

test("extension registers only /continue and exact RPC-style /continue falls through to direct continuation", async () => {
	const cwd = process.cwd();
	const pi = createFakePi(cwd);
	registerContinueExtension(pi);
	assert.deepEqual([...pi.commands.keys()], ["continue"]);
	const ctx = createCommandContext(cwd, async () => undefined);
	await pi.commands.get("continue").handler(undefined, ctx);
	assert.equal(ctx.compactCount, 1);
	ctx.compactOptions.onComplete({});
	assert.deepEqual(pi.sent, [CONTINUATION_PROMPT]);
	await pi.events.get("agent_end")({}, ctx);
	assert.equal(ctx.statusCalls.at(-1), "/continue steer: sending continuation");
	await pi.events.get("before_agent_start")({ prompt: CONTINUATION_PROMPT }, ctx);
	await pi.events.get("message_start")({ message: assistantMessage() }, ctx);
	await pi.commands.get("continue").handler(undefined, ctx);
	assert.equal(ctx.compactCount, 1);
	await pi.events.get("message_end")({ message: assistantMessage() }, ctx);
	await pi.commands.get("continue").handler(undefined, ctx);
	assert.equal(ctx.compactCount, 2);
});

test("agent_end settles only a started continuation resume failure", async () => {
	const cwd = process.cwd();
	const pi = createFakePi(cwd);
	const ctx = createCommandContext(cwd, async () => undefined);
	registerContinueExtension(pi);
	await pi.commands.get("continue").handler("steer", ctx);
	ctx.compactOptions.onComplete({});
	await pi.events.get("agent_end")({}, ctx);
	assert.equal(ctx.statusCalls.at(-1), "/continue steer: sending continuation");
	await pi.events.get("before_agent_start")({ prompt: "unrelated prompt" }, ctx);
	await pi.events.get("agent_end")({}, ctx);
	assert.equal(ctx.statusCalls.at(-1), "/continue steer: sending continuation");
	await pi.events.get("before_agent_start")({ prompt: CONTINUATION_PROMPT }, ctx);
	await pi.events.get("agent_end")({}, ctx);
	assert.equal(ctx.statusCalls.at(-1), "pi-continue resume failed");
});

test("message_end reports failed and aborted resume outcomes accurately", async () => {
	const cwd = process.cwd();
	const failedPi = createFakePi(cwd);
	const failedCtx = createCommandContext(cwd, async () => undefined);
	registerContinueExtension(failedPi);
	await failedPi.commands.get("continue").handler("steer", failedCtx);
	failedCtx.compactOptions.onComplete({});
	await failedPi.events.get("before_agent_start")({ prompt: CONTINUATION_PROMPT }, failedCtx);
	await failedPi.events.get("message_end")({ message: assistantMessage("length") }, failedCtx);
	assert.equal(failedCtx.statusCalls.at(-1), "pi-continue resume failed");

	const abortedPi = createFakePi(cwd);
	const abortedCtx = createCommandContext(cwd, async () => undefined);
	registerContinueExtension(abortedPi);
	await abortedPi.commands.get("continue").handler("steer", abortedCtx);
	abortedCtx.compactOptions.onComplete({});
	await abortedPi.events.get("before_agent_start")({ prompt: CONTINUATION_PROMPT }, abortedCtx);
	await abortedPi.events.get("message_end")({ message: assistantMessage("aborted") }, abortedCtx);
	assert.equal(abortedCtx.statusCalls.at(-1), "pi-continue resume aborted");
});

test("session_compact unsupported automatic ledger overlay reports the degraded path", async () => {
	const cwd = process.cwd();
	const pi = createFakePi(cwd);
	const notifications = [];
	const ctx = createCommandContext(cwd, async () => undefined);
	ctx.ui.notify = (message, type) => {
		notifications.push([message, type]);
	};
	registerContinueExtension(pi);
	await pi.events.get("session_compact")({
		fromExtension: true,
		compactionEntry: {
			id: "compact-1",
			summary: "<continuation>\nledger body\n</continuation>",
			details: { kind: "pi-continue/v3", readFiles: [], modifiedFiles: [] },
		},
	}, ctx);
	await new Promise((resolve) => setTimeout(resolve, 0));
	assert.deepEqual(notifications, [["Continuation Ledger overlay failed: Continuation Ledger overlay is unavailable in this Pi mode.", "error"]]);
	assert.deepEqual(pi.sent, []);
});

test("stale session_compact does not replace the latest owned ledger", async () => {
	const cwd = process.cwd();
	const pi = createFakePi(cwd);
	let rendered = "";
	const ctx = createCommandContext(cwd, async (factory) => {
		const component = factory({ requestRender() {} }, { fg(_color, text) { return text; }, bold(text) { return text; } }, {}, () => {});
		rendered = component.render(80).join("\n");
		return undefined;
	});
	registerContinueExtension(pi);
	await pi.commands.get("continue").handler("steer", ctx);
	ctx.compactOptions.onComplete({});
	await pi.events.get("session_compact")({
		fromExtension: true,
		compactionEntry: {
			id: "compact-1",
			summary: "<continuation>\nfirst ledger\n</continuation>",
			details: { kind: "pi-continue/v3", readFiles: [], modifiedFiles: [], continuationEventId: "continue-1" },
		},
	}, ctx);
	await pi.events.get("session_compact")({
		fromExtension: true,
		compactionEntry: {
			id: "compact-stale",
			summary: "<continuation>\nstale ledger\n</continuation>",
			details: { kind: "pi-continue/v3", readFiles: [], modifiedFiles: [], continuationEventId: "continue-stale" },
		},
	}, ctx);
	await pi.commands.get("continue").handler("ledger", ctx);
	assert.match(rendered, /first ledger/);
	assert.doesNotMatch(rendered, /stale ledger/);
});

test("session_compact ledger display is transient UI and does not send a continuation prompt", async () => {
	const cwd = process.cwd();
	const pi = createFakePi(cwd);
	let customCalls = 0;
	const ctx = createCommandContext(cwd, async (factory) => {
		customCalls += 1;
		factory({ requestRender() {} }, { fg(_color, text) { return text; }, bold(text) { return text; } }, {}, () => {});
		return undefined;
	});
	registerContinueExtension(pi);
	await pi.events.get("session_compact")({
		fromExtension: true,
		compactionEntry: {
			id: "compact-1",
			summary: "<continuation>\nledger body\n</continuation>",
			details: { kind: "pi-continue/v3", readFiles: [], modifiedFiles: [] },
		},
	}, ctx);
	await new Promise((resolve) => setTimeout(resolve, 0));
	assert.equal(customCalls, 1);
	assert.deepEqual(pi.sent, []);
});
