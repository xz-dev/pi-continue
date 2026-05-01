import test from "node:test";
import assert from "node:assert/strict";
import { buildLedgerSnapshot, ContinuationLedgerOverlay, extractContinuationLedger, showContinuationLedgerOverlay } from "../extensions/continue/src/ledger-viewer.ts";

const theme = {
	fg(_color, text) {
		return text;
	},
	bold(text) {
		return text;
	},
};

test("extractContinuationLedger reads only the continuation block", () => {
	const summary = [
		"<continuation>",
		"task: finish runtime proof",
		"workingEdge: tests",
		"</continuation>",
		"",
		"<split-prefix>",
		"old turn prefix",
		"</split-prefix>",
	].join("\n");
	assert.equal(extractContinuationLedger(summary), "task: finish runtime proof\nworkingEdge: tests");
});

test("buildLedgerSnapshot stores transient overlay content without session mutation fields", () => {
	const snapshot = buildLedgerSnapshot("<continuation>\nledger body\n</continuation>", "continue-1", "compact-1");
	assert.ok(snapshot);
	assert.equal(snapshot.eventId, "continue-1");
	assert.equal(snapshot.compactionEntryId, "compact-1");
	assert.equal(snapshot.content, "ledger body");
	assert.equal(Object.hasOwn(snapshot, "message"), false);
	assert.equal(Object.hasOwn(snapshot, "display"), false);
});

test("buildLedgerSnapshot strips terminal control sequences from untrusted content", () => {
	const snapshot = buildLedgerSnapshot(
		"<continuation>\n\u001b]2;secret title\u0007\u001b[31mred\u001b[0m\r\nline\u0000two\n</continuation>",
		"continue-1",
		"compact-1",
	);
	assert.ok(snapshot);
	assert.equal(snapshot.content, "red\nlinetwo");
	assert.doesNotMatch(snapshot.content, /\u001b|\u0007|\u0000/);
});

test("showContinuationLedgerOverlay reports unsupported custom UI", async () => {
	let factoryInvoked = false;
	const shown = await showContinuationLedgerOverlay(
		{
			hasUI: true,
			ui: {
				async custom(factory) {
					factoryInvoked = false;
					return undefined;
				},
			},
		},
		{ eventId: "continue-1", compactionEntryId: "compact-1", content: "ledger", capturedAt: 0 },
	);
	assert.equal(factoryInvoked, false);
	assert.equal(shown, false);
});

test("showContinuationLedgerOverlay reports supported custom UI", async () => {
	let factoryInvoked = false;
	const shown = await showContinuationLedgerOverlay(
		{
			hasUI: true,
			ui: {
				async custom(factory) {
					factoryInvoked = true;
					factory({ requestRender() {} }, theme, {}, () => {});
					return undefined;
				},
			},
		},
		{ eventId: "continue-1", compactionEntryId: "compact-1", content: "ledger", capturedAt: 0 },
	);
	assert.equal(factoryInvoked, true);
	assert.equal(shown, true);
});

test("ContinuationLedgerOverlay renders scrollable ledger aftercare", () => {
	let closed = false;
	let renders = 0;
	const overlay = new ContinuationLedgerOverlay(
		{ eventId: "continue-1", compactionEntryId: "compact-1", content: "line 1\nline 2", capturedAt: 0 },
		theme,
		() => {
			closed = true;
		},
		() => {
			renders += 1;
		},
	);
	const text = overlay.render(80).join("\n");
	assert.match(text, /Continuation Ledger/);
	assert.match(text, /event continue-1 \| compaction compact-1/);
	assert.match(text, /line 1/);
	overlay.handleInput("down");
	overlay.handleInput("q");
	assert.equal(closed, true);
	assert.equal(renders, 0);
});
