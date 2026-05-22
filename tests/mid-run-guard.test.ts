import test from "node:test";
import assert from "node:assert/strict";
import { decideMidRunGuardTrigger, shouldEvaluateMidRunContext } from "../extensions/continue/src/mid-run-guard.ts";

function config(overrides = {}) {
	return {
		enabled: true,
		summarizerModel: "inherit",
		reasoning: "inherit",
		historyMaxTokens: null,
		continuationArtifactMode: "always",
		agentGuidePath: "AGENTS.md",
		agentGuideSyncMode: "off",
		midRunGuardEnabled: true,
		appendCompactionMetadata: true,
		appendReadFileTags: false,
		appendModifiedFileTags: true,
		promptOverridePolicy: "project-override",
		showAfterCompact: true,
		...overrides,
	};
}

function input(overrides = {}) {
	return {
		config: config(),
		piSettings: {
			enabled: true,
			reserveTokens: 20,
			keepRecentTokens: 10,
		},
		contextWindow: 100,
		estimate: {
			tokens: 81,
			usageTokens: 70,
			trailingTokens: 11,
			lastUsageIndex: 3,
		},
		...overrides,
	};
}

test("shouldEvaluateMidRunContext only accepts contexts ending in a contiguous tool-result suffix", () => {
	assert.equal(shouldEvaluateMidRunContext([{ role: "user" }]), false);
	assert.equal(shouldEvaluateMidRunContext([{ role: "user" }, { role: "assistant" }]), false);
	assert.equal(shouldEvaluateMidRunContext([{ role: "user" }, { role: "assistant" }, { role: "toolResult" }]), true);
	assert.equal(shouldEvaluateMidRunContext([{ role: "user" }, { role: "assistant" }, { role: "toolResult" }, { role: "toolResult" }]), true);
	assert.equal(shouldEvaluateMidRunContext([{ role: "user" }, { role: "assistant" }, { role: "toolResult" }, { role: "user" }]), false);
	assert.equal(shouldEvaluateMidRunContext([{ role: "assistant" }, { role: "toolResult" }, { role: "assistant" }]), false);
	assert.equal(shouldEvaluateMidRunContext([{ role: "assistant" }, { role: "user" }, { role: "toolResult" }]), false);
});

test("decideMidRunGuardTrigger ignores disabled branches", () => {
	assert.equal(decideMidRunGuardTrigger(input({ config: config({ enabled: false }) })), undefined);
	assert.equal(decideMidRunGuardTrigger(input({ config: config({ midRunGuardEnabled: false }) })), undefined);
	assert.equal(decideMidRunGuardTrigger(input({ piSettings: { enabled: false, reserveTokens: 20, keepRecentTokens: 10 } })), undefined);
	assert.equal(decideMidRunGuardTrigger(input({ contextWindow: undefined })), undefined);
});

test("decideMidRunGuardTrigger only trips above the reserve threshold", () => {
	assert.equal(decideMidRunGuardTrigger(input({ estimate: { tokens: 80, usageTokens: 70, trailingTokens: 10, lastUsageIndex: 3 } })), undefined);
	assert.deepEqual(decideMidRunGuardTrigger(input()), {
		estimatedTokens: 81,
		thresholdTokens: 80,
		contextWindow: 100,
		reserveTokens: 20,
		usageTokens: 70,
		trailingTokens: 11,
		lastUsageIndex: 3,
	});
});
