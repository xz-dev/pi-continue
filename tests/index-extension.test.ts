import test from "node:test";
import assert from "node:assert/strict";
import { fauxAssistantMessage, registerFauxProvider } from "@mariozechner/pi-ai";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

function continuationArtifactJson() {
	const structured = {
		task: "Continue the task.",
		initiativeCharter: ["Preserve same-session continuation."],
		definitionOfDone: ["A valid continuation ledger is available."],
		recencyLedger: [{ status: "active", subject: "current request", evidence: "test", resolution: "continue" }],
		currentPlan: ["Run the next validation step."],
		progress: ["Compaction synthesis succeeded."],
		state: ["Test fixture state."],
		decisions: ["Use strict v3 JSON artifacts."],
		contextMap: [{ source: "tests/index-extension.test.ts", relevance: "fixture", use: "prove split failure" }],
		workingEdge: ["Fail before document sync when split-prefix parsing fails."],
		validation: ["Test fixture."],
		risks: ["None."],
		dormantContext: ["None."],
		retiredContext: ["None."],
		antiRework: ["Do not use fallback artifacts."],
		durableLearnings: ["Hard-fail synthesis."],
		durablePromotions: [{
			status: "none",
			targetSurface: "none",
			proposal: "No durable surface update from this fixture.",
			evidence: "test",
			durability: "not applicable",
			risk: "not applicable",
			nextAction: "No action.",
		}],
		agentGuideUpdates: ["No guide write."],
	};
	return JSON.stringify({
		version: "pi-continue-artifacts/v3",
		brief: structured,
		document: structured,
		agentGuideMarkdown: null,
		agentGuideChangeReason: "No guide write.",
	});
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

function writeAlwaysSyncConfig(cwd) {
	mkdirSync(join(cwd, ".pi", "extensions"), { recursive: true });
	writeFileSync(join(cwd, ".pi", "extensions", "pi-continue.json"), JSON.stringify({
		continuationDocSyncMode: "always",
		agentGuideSyncMode: "always",
	}), "utf8");
}

function compactionEvent(preparation = {}) {
	return {
		preparation: {
			firstKeptEntryId: "kept-entry",
			messagesToSummarize: [{ role: "user", content: [{ type: "text", text: "continue the task" }], timestamp: 0 }],
			turnPrefixMessages: [],
			isSplitTurn: false,
			tokensBefore: 1200,
			previousSummary: undefined,
			fileOps: { read: new Set(), written: new Set(), edited: new Set() },
			settings: { enabled: true, reserveTokens: 1000, keepRecentTokens: 200 },
			...preparation,
		},
		branchEntries: [],
		customInstructions: undefined,
		signal: new AbortController().signal,
	};
}

function assertNoFailedSynthesisSideEffects(cwd, pi) {
	assert.deepEqual(pi.sent, []);
	assert.equal(existsSync(join(cwd, "CONTINUE.md")), false);
	assert.equal(existsSync(join(cwd, "AGENTS.md")), false);
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

test("session_before_compact fails closed when ledger synthesis cannot authenticate", async () => {
	const cwd = mkdtempSync(join(tmpdir(), "pi-continue-hard-fail-"));
	try {
		writeAlwaysSyncConfig(cwd);
		const pi = createFakePi(cwd);
		const ctx = createCommandContext(cwd, async () => undefined);
		ctx.modelRegistry.getApiKeyAndHeaders = async () => ({
			ok: false,
			error: "provider auth failed",
		});
		registerContinueExtension(pi);
		await assert.rejects(
			pi.events.get("session_before_compact")(compactionEvent(), ctx),
			/Continuation artifact synthesis failed; compaction was aborted before a usable ledger was saved\./,
		);
		assertNoFailedSynthesisSideEffects(cwd, pi);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("session_before_compact fails closed when history artifacts are malformed", async () => {
	const cwd = mkdtempSync(join(tmpdir(), "pi-continue-hard-fail-"));
	const faux = registerFauxProvider();
	try {
		writeAlwaysSyncConfig(cwd);
		faux.setResponses([fauxAssistantMessage("not json")]);
		const pi = createFakePi(cwd);
		const ctx = createCommandContext(cwd, async () => undefined);
		ctx.model = faux.models[0];
		ctx.modelRegistry.getApiKeyAndHeaders = async () => ({ ok: true, apiKey: "test", headers: {} });
		registerContinueExtension(pi);
		await assert.rejects(
			pi.events.get("session_before_compact")(compactionEvent(), ctx),
			/Continuation artifact synthesis failed; compaction was aborted before a usable ledger was saved\./,
		);
		assertNoFailedSynthesisSideEffects(cwd, pi);
	} finally {
		faux.unregister();
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("session_before_compact fails closed when split-prefix artifacts are missing", async () => {
	const cwd = mkdtempSync(join(tmpdir(), "pi-continue-hard-fail-"));
	const faux = registerFauxProvider();
	try {
		writeAlwaysSyncConfig(cwd);
		faux.setResponses([fauxAssistantMessage(continuationArtifactJson()), fauxAssistantMessage("missing split prefix")]);
		const pi = createFakePi(cwd);
		const ctx = createCommandContext(cwd, async () => undefined);
		ctx.model = faux.models[0];
		ctx.modelRegistry.getApiKeyAndHeaders = async () => ({ ok: true, apiKey: "test", headers: {} });
		registerContinueExtension(pi);
		await assert.rejects(
			pi.events.get("session_before_compact")(compactionEvent({
				isSplitTurn: true,
				turnPrefixMessages: [{ role: "user", content: [{ type: "text", text: "split turn prefix" }], timestamp: 0 }],
			}), ctx),
			/Continuation artifact synthesis failed; compaction was aborted before a usable ledger was saved\./,
		);
		assertNoFailedSynthesisSideEffects(cwd, pi);
	} finally {
		faux.unregister();
		rmSync(cwd, { recursive: true, force: true });
	}
});
