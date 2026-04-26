import test from "node:test";
import assert from "node:assert/strict";
import { ContinueMenuComponent } from "../extensions/continue/src/menu.ts";
import { DEFAULT_CONTINUE_CONFIG } from "../extensions/continue/src/config.ts";

const theme = {
	fg(_color, text) {
		return text;
	},
	bold(text) {
		return text;
	},
};

function createSnapshot(overrides = {}) {
	return {
		enabled: true,
		projectRoot: "/tmp/project",
		config: DEFAULT_CONTINUE_CONFIG,
		compaction: { enabled: true, reserveTokens: 1000, keepRecentTokens: 2000 },
		threshold: "127,000 tokens (99.2% of 128,000)",
		contextUsage: "12,000/128,000 tokens (9.4%)",
		compactionRunning: false,
		...overrides,
	};
}

function stripAnsi(value) {
	return value.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "").replace(/\u001b_[^\u0007]*\u0007/g, "");
}

test("ContinueMenuComponent renders a browsable action tree with trust cues", () => {
	const component = new ContinueMenuComponent(createSnapshot(), theme, () => {}, () => {});
	const lines = component.render(96);
	const text = stripAnsi(lines.join("\n"));
	assert.match(text, /Continue now/);
	assert.match(text, /Queue until idle/);
	assert.match(text, /Preview prompts/);
	assert.match(text, /Project settings/);
	assert.match(text, /Agent guide writes: off/);
	assert.match(text, /Continuation doc: off/);
	for (const line of lines) assert.ok(stripAnsi(line).length <= 96, line);
});

test("ContinueMenuComponent captures optional focus for Continue now", () => {
	let selected;
	let renders = 0;
	const component = new ContinueMenuComponent(createSnapshot(), theme, (result) => {
		selected = result;
	}, () => {
		renders += 1;
	});
	for (const char of "finish tests") component.handleInput(char);
	component.handleInput("enter");
	assert.deepEqual(selected, { kind: "continue", mode: "steer", instructions: "finish tests" });
	assert.equal(renders, "finish tests".length);
});

test("ContinueMenuComponent captures queue and preview actions", () => {
	const results = [];
	const component = new ContinueMenuComponent(createSnapshot(), theme, (result) => {
		results.push(result);
	}, () => {});
	component.handleInput("down");
	for (const char of "leave tools alone") component.handleInput(char);
	component.handleInput("enter");
	component.handleInput("down");
	component.handleInput("down");
	for (const char of "show prompt focus") component.handleInput(char);
	component.handleInput("enter");
	assert.deepEqual(results[0], { kind: "continue", mode: "queue", instructions: "leave tools alone" });
	assert.deepEqual(results[1], { kind: "preview", instructions: "show prompt focus" });
});
