import test from "node:test";
import assert from "node:assert/strict";
import { buildLedgerSnapshot, clearContinuationLedgerOverlay, ContinuationLedgerOverlay, extractContinuationLedger, showContinuationLedgerOverlay } from "../extensions/continue/src/ledger-viewer.ts";

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
		"## Task",
		"finish runtime proof",
		"</continuation>",
	].join("\n");
	assert.equal(extractContinuationLedger(summary), "## Task\nfinish runtime proof");
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
				async custom(_factory) {
					factoryInvoked = false;
					return undefined;
				},
			},
		},
		{ eventId: "continue-1", compactionEntryId: "compact-1", content: "ledger", capturedAt: 0 },
		true,
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
		true,
	);
	clearContinuationLedgerOverlay();
	assert.equal(factoryInvoked, true);
	assert.equal(shown, true);
});

test("showContinuationLedgerOverlay updates and focuses the active singleton", async () => {
	let customCalls = 0;
	let focusCalls = 0;
	let requestRenders = 0;
	let resolveOverlay: (() => void) | undefined;
	const ctx = {
		hasUI: true,
		ui: {
			custom(factory, options) {
				customCalls += 1;
				factory({ requestRender() { requestRenders += 1; } }, theme, {}, () => {});
				options.onHandle({ focus() { focusCalls += 1; }, hide() {} });
				return new Promise<void>((resolve) => {
					resolveOverlay = resolve;
				});
			},
		},
	};
	const first = showContinuationLedgerOverlay(ctx, { eventId: "continue-1", compactionEntryId: "compact-1", content: "first", capturedAt: 0 }, true);
	await Promise.resolve();
	assert.equal(await showContinuationLedgerOverlay(ctx, { eventId: "continue-2", compactionEntryId: "compact-2", content: "second", capturedAt: 1 }, true), true);
	assert.equal(customCalls, 1);
	assert.equal(focusCalls, 1);
	assert.equal(requestRenders, 1);
	clearContinuationLedgerOverlay();
	resolveOverlay?.();
	assert.equal(await first, true);
});

test("showContinuationLedgerOverlay can keep backward-compatible stacked overlays", async () => {
	let customCalls = 0;
	const ctx = {
		hasUI: true,
		ui: {
			async custom(factory) {
				customCalls += 1;
				factory({ requestRender() {} }, theme, {}, () => {});
				return undefined;
			},
		},
	};
	assert.equal(await showContinuationLedgerOverlay(ctx, { eventId: "continue-1", compactionEntryId: "compact-1", content: "first", capturedAt: 0 }, false), true);
	assert.equal(await showContinuationLedgerOverlay(ctx, { eventId: "continue-2", compactionEntryId: "compact-2", content: "second", capturedAt: 1 }, false), true);
	assert.equal(customCalls, 2);
});

test("ContinuationLedgerOverlay renders scrollable ledger panel", () => {
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
	assert.match(text, /run continue-1 \| compaction compact-1/);
	assert.match(text, /line 1/);
	overlay.handleInput("down");
	overlay.handleInput("q");
	assert.equal(closed, true);
	assert.equal(renders, 0);
});

test("ContinuationLedgerOverlay updates content in place", () => {
	let renders = 0;
	const overlay = new ContinuationLedgerOverlay(
		{ eventId: "continue-1", compactionEntryId: "compact-1", content: "first", capturedAt: 0 },
		theme,
		() => {},
		() => {
			renders += 1;
		},
	);
	overlay.handleInput("down");
	overlay.setLedger({ eventId: "continue-2", compactionEntryId: "compact-2", content: "second", capturedAt: 1 });
	const text = overlay.render(80).join("\n");
	assert.match(text, /run continue-2 \| compaction compact-2/);
	assert.match(text, /second/);
	assert.doesNotMatch(text, /first/);
	assert.equal(renders, 1);
});
