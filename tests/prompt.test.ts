import test from "node:test";
import assert from "node:assert/strict";
import { compileHistoryPrompt } from "../extensions/continue/src/prompt.ts";

test("compileHistoryPrompt includes runtime sections and provenance", () => {
	const prompt = compileHistoryPrompt(
		{
			system: { content: "system text", sourcePath: "/pkg/system.md" },
			baseUser: { content: "base text", sourcePath: "/pkg/base.md" },
			scenarioUser: { content: "scenario text", sourcePath: "/pkg/scenario.md" },
		},
		{
			scenario: "update",
			projectRoot: "/repo",
			continuationDocPath: "/repo/CONTINUE.md",
			existingContinuationDoc: "old doc",
			agentGuidePath: "/repo/AGENTS.md",
			existingAgentGuide: "agent guide",
			previousSummary: "old summary",
			historyTranscript: "serialized history",
			turnPrefixTranscript: undefined,
			customInstructions: "focus here",
			fileOps: { readFiles: ["/repo/a.ts"], modifiedFiles: ["/repo/b.ts"] },
		},
	);
	assert.equal(prompt.systemPrompt, "system text");
	assert.match(prompt.userPrompt, /<base-continuation-contract>[\s\S]*base text/);
	assert.match(prompt.userPrompt, /<existing-continuation-md>[\s\S]*old doc/);
	assert.match(prompt.userPrompt, /<agent-guide-path>[\s\S]*\/repo\/AGENTS\.md/);
	assert.match(prompt.userPrompt, /<existing-agent-guide>[\s\S]*agent guide/);
	assert.match(prompt.userPrompt, /<history-to-summarize>[\s\S]*serialized history/);
	assert.match(prompt.userPrompt, /<turn-prefix-messages>\s*\(none\)\s*<\/turn-prefix-messages>/);
	assert.match(prompt.userPrompt, /<file-operations>[\s\S]*<read-files>[\s\S]*\/repo\/a.ts/);
	assert.deepEqual(prompt.sources, {
		system: "/pkg/system.md",
		baseUser: "/pkg/base.md",
		scenarioUser: "/pkg/scenario.md",
	});
});

test("compileHistoryPrompt renders turn-prefix-messages when split-turn material is present", () => {
	const prompt = compileHistoryPrompt(
		{
			system: { content: "system", sourcePath: "/pkg/s.md" },
			baseUser: { content: "base", sourcePath: "/pkg/b.md" },
			scenarioUser: { content: "scenario", sourcePath: "/pkg/u.md" },
		},
		{
			scenario: "initial",
			projectRoot: "/repo",
			continuationDocPath: "/repo/CONTINUE.md",
			existingContinuationDoc: undefined,
			agentGuidePath: "/repo/AGENTS.md",
			existingAgentGuide: undefined,
			previousSummary: undefined,
			historyTranscript: "",
			turnPrefixTranscript: "user asks for the work; assistant began grepping",
			customInstructions: undefined,
			fileOps: { readFiles: [], modifiedFiles: [] },
		},
	);
	assert.match(prompt.userPrompt, /<turn-prefix-messages>[\s\S]*user asks for the work/);
});
