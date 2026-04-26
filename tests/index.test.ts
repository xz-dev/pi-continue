import test from "node:test";
import assert from "node:assert/strict";
import { buildContinuationCommandArgs, shouldOpenContinuePalette, splitContinueSubcommand } from "../extensions/continue/src/command-shape.ts";

test("shouldOpenContinuePalette opens only exact /continue with UI", () => {
	assert.equal(shouldOpenContinuePalette(undefined, true), true);
	assert.equal(shouldOpenContinuePalette("", true), true);
	assert.equal(shouldOpenContinuePalette("   ", true), true);
	assert.equal(shouldOpenContinuePalette(undefined, false), false);
	assert.equal(shouldOpenContinuePalette("steer", true), false);
	assert.equal(shouldOpenContinuePalette("queue focus", true), false);
});

test("splitContinueSubcommand preserves operator shortcuts only", () => {
	assert.deepEqual(splitContinueSubcommand("status"), { name: "status", rest: undefined });
	assert.deepEqual(splitContinueSubcommand("settings global"), { name: "settings", rest: "global" });
	assert.deepEqual(splitContinueSubcommand("preview focus validation"), { name: "preview", rest: "focus validation" });
	assert.equal(splitContinueSubcommand("steer focus"), undefined);
	assert.equal(splitContinueSubcommand("arbitrary focus"), undefined);
});

test("buildContinuationCommandArgs routes palette selections through typed runtime shortcuts", () => {
	assert.equal(buildContinuationCommandArgs("steer", undefined), "steer");
	assert.equal(buildContinuationCommandArgs("queue", "  preserve state  "), "queue preserve state");
});
