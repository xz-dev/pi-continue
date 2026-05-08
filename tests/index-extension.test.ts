import test from "node:test";
import assert from "node:assert/strict";
import { fauxAssistantMessage, registerFauxProvider } from "@earendil-works/pi-ai";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

function highUsageAssistantMessage() {
	return {
		...assistantMessage("toolUse"),
		usage: { input: 45, output: 45, cacheRead: 0, cacheWrite: 0, totalTokens: 90, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
	};
}

function userMessage(text) {
	return {
		role: "user",
		content: [{ type: "text", text }],
		timestamp: 0,
	};
}

function toolResultMessage(text) {
	return {
		role: "toolResult",
		toolCallId: "tool-1",
		toolName: "bash",
		content: [{ type: "text", text }],
		isError: false,
		timestamp: 0,
	};
}

function createFakePi(cwd) {
	const commands = new Map();
	const events = new Map();
	const sent = [];
	const sentOptions = [];
	return {
		commands,
		events,
		sent,
		sentOptions,
		registerCommand(name, command) {
			commands.set(name, command);
		},
		on(name, handler) {
			events.set(name, handler);
		},
		sendUserMessage(prompt, options) {
			sent.push(prompt);
			sentOptions.push(options);
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

function continuationArtifactJson(agentGuideMarkdown = null) {
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
		agentGuideMarkdown,
		agentGuideChangeReason: agentGuideMarkdown ? "Write configured guide replacement." : "No guide write.",
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

function ownedCompactionEvent(eventId = "continue-1", details = {}) {
	return {
		fromExtension: true,
		compactionEntry: {
			id: `compact-${eventId}`,
			summary: "<continuation>\nledger body\n</continuation>",
			details: { kind: "pi-continue/v3", readFiles: [], modifiedFiles: [], continuationEventId: eventId, ...details },
		},
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
	assert.deepEqual(pi.sent, []);
	await pi.events.get("session_compact")(ownedCompactionEvent(), ctx);
	assert.deepEqual(pi.sent, [CONTINUATION_PROMPT]);
	assert.deepEqual(pi.sentOptions, [{ deliverAs: "followUp" }]);
	await pi.events.get("agent_end")({}, ctx);
	assert.equal(ctx.statusCalls.at(-1), "/continue steer: resuming this session");
	await pi.events.get("before_agent_start")({ prompt: CONTINUATION_PROMPT }, ctx);
	await pi.events.get("message_start")({ message: assistantMessage() }, ctx);
	await pi.commands.get("continue").handler(undefined, ctx);
	assert.equal(ctx.compactCount, 1);
	await pi.events.get("message_end")({ message: assistantMessage() }, ctx);
	await pi.commands.get("continue").handler(undefined, ctx);
	assert.equal(ctx.compactCount, 2);
});

test("palette continuation dispatches resume as follow-up", async () => {
	const cwd = process.cwd();
	const pi = createFakePi(cwd);
	const ctx = createCommandContext(cwd, async (factory) => {
		let selected;
		const component = factory({ requestRender() {} }, ctx.ui.theme, {}, (result) => {
			selected = result;
		});
		component.handleInput("enter");
		return selected;
	});
	registerContinueExtension(pi);
	await pi.commands.get("continue").handler(undefined, ctx);
	assert.equal(ctx.compactCount, 1);
	ctx.compactOptions.onComplete({});
	await pi.events.get("session_compact")(ownedCompactionEvent(), ctx);
	assert.deepEqual(pi.sent, [CONTINUATION_PROMPT]);
	assert.deepEqual(pi.sentOptions, [{ deliverAs: "followUp" }]);
});

test("queued follow-up message_start starts same-session resume proof", async () => {
	const cwd = process.cwd();
	const pi = createFakePi(cwd);
	const ctx = createCommandContext(cwd, async () => undefined);
	ctx.isIdle = () => false;
	registerContinueExtension(pi);
	await pi.commands.get("continue").handler("steer", ctx);
	ctx.compactOptions.onComplete({});
	await pi.events.get("session_compact")(ownedCompactionEvent(), ctx);
	assert.deepEqual(pi.sent, [CONTINUATION_PROMPT]);
	assert.deepEqual(pi.sentOptions, [{ deliverAs: "followUp" }]);
	await pi.events.get("message_start")({ message: userMessage(CONTINUATION_PROMPT) }, ctx);
	assert.equal(ctx.statusCalls.at(-1), "pi-continue resume running");
	await pi.events.get("message_end")({ message: assistantMessage() }, ctx);
	assert.equal(ctx.statusCalls.at(-1), undefined);
});

test("mid-run guard dispatches resume as follow-up after context threshold proof", async () => {
	const cwd = mkdtempSync(join(tmpdir(), "pi-continue-mid-run-dispatch-"));
	try {
		mkdirSync(join(cwd, ".pi"), { recursive: true });
		writeFileSync(join(cwd, ".pi", "settings.json"), JSON.stringify({
			compaction: { enabled: true, reserveTokens: 20, keepRecentTokens: 10 },
		}), "utf8");
		const pi = createFakePi(cwd);
		const ctx = createCommandContext(cwd, async () => undefined);
		ctx.model = { ...ctx.model, contextWindow: 100 };
		registerContinueExtension(pi);
		await pi.events.get("context")({
			messages: [userMessage("run tool"), highUsageAssistantMessage(), toolResultMessage("x".repeat(160))],
		}, ctx);
		assert.equal(ctx.compactCount, 1);
		ctx.compactOptions.onComplete({});
		await pi.events.get("session_compact")(ownedCompactionEvent(), ctx);
		assert.deepEqual(pi.sent, [CONTINUATION_PROMPT]);
		assert.deepEqual(pi.sentOptions, [{ deliverAs: "followUp" }]);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("settings and reset reject invalid scope arguments without opening dialogs", async () => {
	const cwd = process.cwd();
	const pi = createFakePi(cwd);
	const ctx = createCommandContext(cwd, async () => undefined);
	const notifications = [];
	let selects = 0;
	let confirms = 0;
	ctx.ui.notify = (message, type) => {
		notifications.push([message, type]);
	};
	ctx.ui.select = async () => {
		selects += 1;
		return undefined;
	};
	ctx.ui.confirm = async () => {
		confirms += 1;
		return false;
	};
	registerContinueExtension(pi);
	await pi.commands.get("continue").handler("settings global extra", ctx);
	await pi.commands.get("continue").handler("reset typo", ctx);
	assert.deepEqual(notifications, [
		["Usage: /continue settings [project|global]", "warning"],
		["Usage: /continue reset [project|global]", "warning"],
	]);
	assert.equal(selects, 0);
	assert.equal(confirms, 0);
});

test("settings dialog can edit the human handoff trigger", async () => {
	const cwd = mkdtempSync(join(tmpdir(), "pi-continue-trigger-settings-"));
	try {
		mkdirSync(join(cwd, ".pi"), { recursive: true });
		writeFileSync(join(cwd, ".pi", "settings.json"), JSON.stringify({ compaction: { reserveTokens: 68000 } }), "utf8");
		const pi = createFakePi(cwd);
		const ctx = createCommandContext(cwd, async () => undefined);
		const notifications = [];
		let settingsSelectCount = 0;
		ctx.ui.notify = (message, type) => {
			notifications.push([message, type]);
		};
		ctx.ui.select = async (title, options) => {
			if (title === "Continuation settings") {
				settingsSelectCount += 1;
				if (settingsSelectCount > 1) return "Done";
				const triggerOption = options.find((option) => option.startsWith("Handoff trigger:"));
				assert.equal(triggerOption, "Handoff trigger: 60,000 tokens");
				return triggerOption;
			}
			if (title === "Handoff trigger") {
				assert.deepEqual(options, [
					"Keep current (60,000 tokens)",
					"Set trigger token count",
					"Use inherited/default trigger for this scope",
				]);
				return "Set trigger token count";
			}
			return undefined;
		};
		ctx.ui.input = async (title, placeholder) => {
			assert.equal(title, "Handoff trigger");
			assert.equal(placeholder, "token count, for example 96000");
			return "96,000";
		};
		registerContinueExtension(pi);
		await pi.commands.get("continue").handler("settings project", ctx);
		const settings = JSON.parse(readFileSync(join(cwd, ".pi", "settings.json"), "utf8"));
		assert.deepEqual(settings, { compaction: { reserveTokens: 32000 } });
		assert.deepEqual(notifications, [["Updated project handoff trigger", "info"]]);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("agent_end settles only a started continuation resume failure", async () => {
	const cwd = process.cwd();
	const pi = createFakePi(cwd);
	const ctx = createCommandContext(cwd, async () => undefined);
	registerContinueExtension(pi);
	await pi.commands.get("continue").handler("steer", ctx);
	ctx.compactOptions.onComplete({});
	await pi.events.get("session_compact")(ownedCompactionEvent(), ctx);
	await pi.events.get("agent_end")({}, ctx);
	assert.equal(ctx.statusCalls.at(-1), "/continue steer: resuming this session");
	await pi.events.get("before_agent_start")({ prompt: "unrelated prompt" }, ctx);
	await pi.events.get("agent_end")({}, ctx);
	assert.equal(ctx.statusCalls.at(-1), "/continue steer: resuming this session");
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
	await failedPi.events.get("session_compact")(ownedCompactionEvent(), failedCtx);
	await failedPi.events.get("before_agent_start")({ prompt: CONTINUATION_PROMPT }, failedCtx);
	await failedPi.events.get("message_end")({ message: assistantMessage("length") }, failedCtx);
	assert.equal(failedCtx.statusCalls.at(-1), "pi-continue resume failed");

	const abortedPi = createFakePi(cwd);
	const abortedCtx = createCommandContext(cwd, async () => undefined);
	registerContinueExtension(abortedPi);
	await abortedPi.commands.get("continue").handler("steer", abortedCtx);
	abortedCtx.compactOptions.onComplete({});
	await abortedPi.events.get("session_compact")(ownedCompactionEvent(), abortedCtx);
	await abortedPi.events.get("before_agent_start")({ prompt: CONTINUATION_PROMPT }, abortedCtx);
	await abortedPi.events.get("message_end")({ message: assistantMessage("aborted") }, abortedCtx);
	assert.equal(abortedCtx.statusCalls.at(-1), "pi-continue resume aborted");
});

test("session_compact native or invalid active handoff proof fails closed without resume", async () => {
	const cwd = process.cwd();
	const nativePi = createFakePi(cwd);
	const nativeCtx = createCommandContext(cwd, async () => undefined);
	registerContinueExtension(nativePi);
	await nativePi.commands.get("continue").handler("steer", nativeCtx);
	await nativePi.events.get("session_compact")({
		fromExtension: false,
		compactionEntry: { id: "native", summary: "native summary", details: { readFiles: [], modifiedFiles: [] } },
	}, nativeCtx);
	nativeCtx.compactOptions.onComplete({});
	assert.deepEqual(nativePi.sent, []);
	assert.equal(nativeCtx.statusCalls.at(-1), "pi-continue: failed");

	const invalidPi = createFakePi(cwd);
	const invalidCtx = createCommandContext(cwd, async () => undefined);
	registerContinueExtension(invalidPi);
	await invalidPi.commands.get("continue").handler("steer", invalidCtx);
	invalidCtx.compactOptions.onComplete({});
	await invalidPi.events.get("session_compact")({
		fromExtension: true,
		compactionEntry: { id: "invalid", summary: "invalid summary", details: { kind: "pi-continue/v3", readFiles: [] } },
	}, invalidCtx);
	assert.deepEqual(invalidPi.sent, []);
	assert.equal(invalidCtx.statusCalls.at(-1), "pi-continue: failed");

	const stalePi = createFakePi(cwd);
	const staleCtx = createCommandContext(cwd, async () => undefined);
	registerContinueExtension(stalePi);
	await stalePi.commands.get("continue").handler("steer", staleCtx);
	staleCtx.compactOptions.onComplete({});
	await stalePi.events.get("session_compact")({
		fromExtension: true,
		compactionEntry: {
			id: "stale",
			summary: "<continuation>\nstale summary\n</continuation>",
			details: { kind: "pi-continue/v3", readFiles: [], modifiedFiles: [], continuationEventId: "continue-stale" },
		},
	}, staleCtx);
	assert.deepEqual(stalePi.sent, []);
	assert.equal(staleCtx.statusCalls.at(-1), "pi-continue: failed");
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
	assert.deepEqual(notifications, [["Could not open Continuation Ledger: Continuation Ledger cannot open in this Pi mode.", "error"]]);
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

test("session_before_compact and session_compact write configured documents only after a successful compaction", async () => {
	const cwd = mkdtempSync(join(tmpdir(), "pi-continue-sync-success-"));
	const faux = registerFauxProvider();
	try {
		writeAlwaysSyncConfig(cwd);
		faux.setResponses([fauxAssistantMessage(continuationArtifactJson("# Agent Guide\n\nDurable rule.\n")), fauxAssistantMessage("raw split prefix")]);
		const pi = createFakePi(cwd);
		const ctx = createCommandContext(cwd, async () => undefined);
		ctx.model = faux.models[0];
		ctx.modelRegistry.getApiKeyAndHeaders = async () => ({ ok: true, apiKey: "test", headers: {} });
		registerContinueExtension(pi);
		const result = await pi.events.get("session_before_compact")(compactionEvent({
			isSplitTurn: true,
			turnPrefixMessages: [{ role: "user", content: [{ type: "text", text: "split turn prefix" }], timestamp: 0 }],
		}), ctx);
		assert.equal(existsSync(join(cwd, "CONTINUE.md")), false);
		assert.equal(existsSync(join(cwd, "AGENTS.md")), false);
		assert.deepEqual(pi.sent, []);
		const summary = result.compaction.summary;
		assert.equal(summary.match(/<split-prefix>/g)?.length, 1);
		assert.match(summary, /<split-prefix>\nraw split prefix\n<\/split-prefix>/);
		await pi.events.get("session_compact")({
			fromExtension: true,
			compactionEntry: {
				id: "compact-success",
				summary,
				details: result.compaction.details,
			},
		}, ctx);
		assert.match(readFileSync(join(cwd, "CONTINUE.md"), "utf8"), /# Continuation/);
		assert.match(readFileSync(join(cwd, "AGENTS.md"), "utf8"), /Durable rule/);
		assert.deepEqual(pi.sent, []);
	} finally {
		faux.unregister();
		rmSync(cwd, { recursive: true, force: true });
	}
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
		const result = await pi.events.get("session_before_compact")(compactionEvent(), ctx);
		assert.deepEqual(result, { cancel: true });
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
		const result = await pi.events.get("session_before_compact")(compactionEvent(), ctx);
		assert.deepEqual(result, { cancel: true });
		assertNoFailedSynthesisSideEffects(cwd, pi);
	} finally {
		faux.unregister();
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("session_before_compact fails closed when split-prefix output is empty", async () => {
	const cwd = mkdtempSync(join(tmpdir(), "pi-continue-hard-fail-"));
	const faux = registerFauxProvider();
	try {
		writeAlwaysSyncConfig(cwd);
		faux.setResponses([fauxAssistantMessage(continuationArtifactJson()), fauxAssistantMessage("\n\t")]);
		const pi = createFakePi(cwd);
		const ctx = createCommandContext(cwd, async () => undefined);
		ctx.model = faux.models[0];
		ctx.modelRegistry.getApiKeyAndHeaders = async () => ({ ok: true, apiKey: "test", headers: {} });
		registerContinueExtension(pi);
		const result = await pi.events.get("session_before_compact")(compactionEvent({
			isSplitTurn: true,
			turnPrefixMessages: [{ role: "user", content: [{ type: "text", text: "split turn prefix" }], timestamp: 0 }],
		}), ctx);
		assert.deepEqual(result, { cancel: true });
		assertNoFailedSynthesisSideEffects(cwd, pi);
	} finally {
		faux.unregister();
		rmSync(cwd, { recursive: true, force: true });
	}
});
