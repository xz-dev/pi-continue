import test from "node:test";
import assert from "node:assert/strict";
import { createContinuationRuntimeState } from "../extensions/continue/src/runtime.ts";
import {
	beginWorkingVisuals,
	clearWorkingVisuals,
	settleWorkingVisuals,
} from "../extensions/continue/src/working-ui.ts";

test("working visuals are a compact working indicator, not an editor status line", () => {
	const runtime = createContinuationRuntimeState();
	const calls = [];
	const ctx = {
		hasUI: true,
		ui: {
			theme: { fg(_color, text) { return text; } },
			setWorkingMessage(message) { calls.push(["message", message]); },
			setWorkingIndicator(options) { calls.push(["indicator", options?.intervalMs]); },
			setEditorComponent() { calls.push(["editor"]); },
		},
	};
	beginWorkingVisuals(ctx, runtime, "continue-1", "pi-continue compacting");
	settleWorkingVisuals(ctx, runtime, "continue-2");
	settleWorkingVisuals(ctx, runtime, "continue-1");
	assert.deepEqual(calls, [
		["message", "pi-continue compacting"],
		["indicator", 120],
		["message", undefined],
		["indicator", undefined],
	]);
});

test("clearWorkingVisuals restores only the owning working indicator", () => {
	const runtime = createContinuationRuntimeState();
	const calls = [];
	const ctx = {
		hasUI: true,
		ui: {
			theme: { fg(_color, text) { return text; } },
			setWorkingMessage(message) { calls.push(["message", message]); },
			setWorkingIndicator(options) { calls.push(["indicator", options?.intervalMs]); },
		},
	};
	beginWorkingVisuals(ctx, runtime, "continue-3", "pi-continue compacting");
	clearWorkingVisuals(ctx, runtime);
	clearWorkingVisuals(ctx, runtime);
	assert.deepEqual(calls, [
		["message", "pi-continue compacting"],
		["indicator", 120],
		["message", undefined],
		["indicator", undefined],
	]);
});
