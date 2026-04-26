import test from "node:test";
import assert from "node:assert/strict";
import { compileHistoryPrompt, compileSplitPrompt } from "../extensions/continue/src/prompt.ts";

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
	assert.match(prompt.userPrompt, /<file-operations>[\s\S]*<read-files>[\s\S]*\/repo\/a.ts/);
	assert.deepEqual(prompt.sources, {
		system: "/pkg/system.md",
		baseUser: "/pkg/base.md",
		scenarioUser: "/pkg/scenario.md",
	});
});

test("compileSplitPrompt includes split transcript", () => {
	const prompt = compileSplitPrompt(
		{
			system: { content: "split system", sourcePath: "/pkg/split-system.md" },
			scenarioUser: { content: "split user", sourcePath: "/pkg/split-user.md" },
		},
		{
			projectRoot: "/repo",
			continuationDocPath: "/repo/CONTINUE.md",
			splitPrefixTranscript: "prefix transcript",
			customInstructions: undefined,
		},
	);
	assert.equal(prompt.systemPrompt, "split system");
	assert.match(prompt.userPrompt, /<split-prefix-history>[\s\S]*prefix transcript/);
	assert.equal(prompt.sources.system, "/pkg/split-system.md");
	assert.equal(prompt.sources.scenarioUser, "/pkg/split-user.md");
});
