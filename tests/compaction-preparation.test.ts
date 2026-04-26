import test from "node:test";
import assert from "node:assert/strict";
import {
	normalizeCompactionPreparation,
	type ContinuationCompactionPreparation,
} from "../extensions/continue/src/compaction-preparation.ts";

function emptyFileOps() {
	return {
		read: new Set<string>(),
		written: new Set<string>(),
		edited: new Set<string>(),
	};
}

function noOpPreparation(overrides = {}): ContinuationCompactionPreparation {
	return {
		firstKeptEntryId: "model",
		messagesToSummarize: [],
		turnPrefixMessages: [],
		isSplitTurn: false,
		tokensBefore: 219900,
		previousSummary: undefined,
		fileOps: emptyFileOps(),
		settings: { enabled: true, reserveTokens: 68000, keepRecentTokens: 20000 },
		...overrides,
	};
}

function messageEntry(id: string, parentId: string, role: string, content: unknown[] = []) {
	return {
		type: "message",
		id,
		parentId,
		timestamp: "2026-04-26T13:00:00.000Z",
		message: {
			role,
			content,
			timestamp: 1777208400000,
		},
	};
}

function textBlock(text: string) {
	return { type: "text", text };
}

function toolCallBlock(name: string, args: Record<string, unknown>) {
	return { type: "toolCall", name, arguments: args };
}

function roleOf(message: unknown): string | undefined {
	if (typeof message !== "object" || message === null || !("role" in message)) return undefined;
	const role = message.role;
	return typeof role === "string" ? role : undefined;
}

test("normalizeCompactionPreparation repairs Pi no-op cuts at completed tool-result suffixes", () => {
	const branchEntries = [
		{ type: "model_change", id: "model", parentId: null, provider: "openai-codex", modelId: "gpt-5.5" },
		{ type: "thinking_level_change", id: "think", parentId: "model", thinkingLevel: "xhigh" },
		messageEntry("u1", "think", "user", [textBlock("initial task")]),
		messageEntry("a1", "u1", "assistant", [toolCallBlock("read", { path: "/repo/old.ts" })]),
		messageEntry("tr1", "a1", "toolResult", [textBlock("old file")]),
		messageEntry("u2", "tr1", "user", [textBlock("correction before official docs")]),
		messageEntry("a2", "u2", "assistant", [toolCallBlock("exa_search", { query: "official docs" })]),
		messageEntry("tr2", "a2", "toolResult", [textBlock("search result 1")]),
		messageEntry("tr3", "tr2", "toolResult", [textBlock("search result 2")]),
	];

	const normalized = normalizeCompactionPreparation(noOpPreparation(), branchEntries);

	assert.equal(normalized.repairedNoOpCut, true);
	assert.equal(normalized.firstKeptEntryId, "a2");
	assert.equal(normalized.isSplitTurn, true);
	assert.deepEqual(normalized.messagesToSummarize.map(roleOf), ["user", "assistant", "toolResult"]);
	assert.deepEqual(normalized.turnPrefixMessages.map(roleOf), ["user"]);
	assert.deepEqual([...normalized.fileOps.read], ["/repo/old.ts"]);
});

test("normalizeCompactionPreparation leaves non-empty Pi preparations untouched", () => {
	const branchEntries = [
		messageEntry("u1", "model", "user", [textBlock("task")]),
		messageEntry("a1", "u1", "assistant", [toolCallBlock("read", { path: "/repo/file.ts" })]),
		messageEntry("tr1", "a1", "toolResult", [textBlock("file")]),
	];
	const originalMessage = { role: "user", content: [textBlock("already prepared")] };
	const preparation = noOpPreparation({
		firstKeptEntryId: "a1",
		messagesToSummarize: [originalMessage],
	});

	const normalized = normalizeCompactionPreparation(preparation, branchEntries);

	assert.equal(normalized.repairedNoOpCut, false);
	assert.equal(normalized.firstKeptEntryId, "a1");
	assert.deepEqual(normalized.messagesToSummarize, [originalMessage]);
});

test("normalizeCompactionPreparation leaves branches without a completed tool batch untouched", () => {
	const branchEntries = [
		messageEntry("u1", "model", "user", [textBlock("task")]),
		messageEntry("a1", "u1", "assistant", [textBlock("final answer")]),
	];

	const normalized = normalizeCompactionPreparation(noOpPreparation(), branchEntries);

	assert.equal(normalized.repairedNoOpCut, false);
	assert.equal(normalized.firstKeptEntryId, "model");
});
