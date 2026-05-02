import test from "node:test";
import assert from "node:assert/strict";
import type { Api, Model, ModelThinkingLevel } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { DEFAULT_CONTINUE_CONFIG } from "../extensions/continue/src/config.ts";
import { getReasoningOptionsForModel } from "../extensions/continue/src/commands.ts";
import { resolveReasoningLevel } from "../extensions/continue/src/model.ts";
import type { ContinuationConfig } from "../extensions/continue/src/types.ts";

function pi(thinkingLevel: ModelThinkingLevel): Pick<ExtensionAPI, "getThinkingLevel"> {
	return {
		getThinkingLevel() {
			return thinkingLevel;
		},
	};
}

function model(overrides: Partial<Model<Api>> = {}): Model<Api> {
	return {
		id: "test-model",
		name: "Test Model",
		api: "openai-completions",
		provider: "test-provider",
		baseUrl: "https://example.invalid/v1",
		reasoning: true,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 128000,
		maxTokens: 4096,
		...overrides,
	};
}

function config(reasoning: ContinuationConfig["reasoning"]): ContinuationConfig {
	return {
		...DEFAULT_CONTINUE_CONFIG,
		reasoning,
	};
}

test("resolveReasoningLevel clamps inherited thinking through model thinkingLevelMap", () => {
	const summarizer = model({
		thinkingLevelMap: {
			minimal: null,
			low: null,
			medium: null,
			high: "high",
			xhigh: "max",
		},
	});

	assert.equal(resolveReasoningLevel(pi("low"), summarizer, config("inherit")), "high");
});

test("resolveReasoningLevel clamps explicit off when the model cannot disable thinking", () => {
	const summarizer = model({ thinkingLevelMap: { off: null } });

	assert.equal(resolveReasoningLevel(pi("off"), summarizer, config("off")), "minimal");
});

test("resolveReasoningLevel omits reasoning for non-reasoning models", () => {
	const summarizer = model({ reasoning: false });

	assert.equal(resolveReasoningLevel(pi("high"), summarizer, config("inherit")), undefined);
});

test("getReasoningOptionsForModel hides unsupported model thinking levels", () => {
	const summarizer = model({
		thinkingLevelMap: {
			off: null,
			minimal: null,
			low: null,
			medium: null,
			high: "high",
			xhigh: "max",
		},
	});

	assert.deepEqual(getReasoningOptionsForModel(summarizer), ["inherit", "high", "xhigh"]);
});
