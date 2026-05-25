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

function userMessage() {
	return { role: "user" };
}

function assistantMessage(...toolCallIds: string[]) {
	return {
		role: "assistant",
		content: toolCallIds.map((id) => ({ type: "toolCall", id, name: "read", arguments: { path: `/repo/${id}.ts` } })),
	};
}

function assistantTextMessage() {
	return { role: "assistant", content: [{ type: "text", text: "done" }] };
}

function toolResultMessage(toolCallId: string) {
	return { role: "toolResult", toolCallId, toolName: "read", content: [{ type: "text", text: "file" }], isError: false };
}

test("shouldEvaluateMidRunContext only accepts contexts ending in a complete assistant/tool-result batch", () => {
	assert.equal(shouldEvaluateMidRunContext([{ role: "user" }]), false);
	assert.equal(shouldEvaluateMidRunContext([userMessage(), assistantMessage("call-a")]), false);
	assert.equal(shouldEvaluateMidRunContext([userMessage(), assistantMessage("call-a"), toolResultMessage("call-a")]), true);
	assert.equal(shouldEvaluateMidRunContext([userMessage(), assistantMessage("call-a", "call-b"), toolResultMessage("call-a"), toolResultMessage("call-b")]), true);
	assert.equal(shouldEvaluateMidRunContext([userMessage(), assistantMessage("call-a"), toolResultMessage("call-a"), userMessage()]), false);
	assert.equal(shouldEvaluateMidRunContext([assistantMessage("call-a"), toolResultMessage("call-a"), assistantTextMessage()]), false);
	assert.equal(shouldEvaluateMidRunContext([assistantMessage("call-a"), userMessage(), toolResultMessage("call-a")]), false);
	assert.equal(shouldEvaluateMidRunContext([userMessage(), assistantTextMessage(), toolResultMessage("orphan")]), false);
	assert.equal(shouldEvaluateMidRunContext([userMessage(), assistantMessage("call-a"), toolResultMessage("call-b")]), false);
	assert.equal(shouldEvaluateMidRunContext([userMessage(), assistantMessage("call-a", "call-b"), toolResultMessage("call-a")]), false);
	assert.equal(shouldEvaluateMidRunContext([userMessage(), assistantMessage("call-a"), toolResultMessage("call-a"), toolResultMessage("extra")]), false);
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
