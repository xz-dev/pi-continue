import test from "node:test";
import assert from "node:assert/strict";
import { buildHistoryFallback } from "../extensions/continue/src/fallback.ts";

function historyInput() {
	return {
		scenario: "update" as const,
		projectRoot: "/repo",
		continuationDocPath: "/repo/CONTINUE.md",
		existingContinuationDoc: "durable continuation",
		previousSummary: "previous summary",
		historyTranscript: "recent history",
		customInstructions: "focus validation",
		fileOps: {
			readFiles: ["/repo/read-1.ts", "/repo/read-2.ts", "/repo/read-3.ts"],
			modifiedFiles: ["/repo/mod-1.ts", "/repo/mod-2.ts", "/repo/mod-3.ts", "/repo/mod-4.ts", "/repo/mod-5.ts"],
		},
	};
}

test("buildHistoryFallback emits bounded must-read and start-here sections", () => {
	const fallback = buildHistoryFallback(historyInput(), "model failed");
	assert.match(fallback.continuation, /## Must Read/);
	assert.match(fallback.continuation, /## Start From Here/);
	assert.match(fallback.continuation, /\/repo\/CONTINUE\.md — durable repo-local continuation document/);
	assert.match(fallback.continuation, /\/repo\/mod-1\.ts — modified during the compacted history/);
	assert.doesNotMatch(fallback.continuation, /\/repo\/mod-5\.ts/);
	assert.doesNotMatch(fallback.continuation, /\/repo\/read-1\.ts/);
	assert.match(fallback.continuation, /not read-path activity/);
	assert.doesNotMatch(fallback.continuation, /Read files:/);
	assert.match(fallback.continuationMd, /## Must Read/);
	assert.match(fallback.continuationMd, /## Start From Here/);
	assert.match(fallback.continuationMd, /read-path counts are diagnostic only/);
	assert.match(fallback.continuationMd, /## Recent File Activity Counts/);
	assert.match(fallback.continuationMd, /Read path count: 3/);
	assert.doesNotMatch(fallback.continuationMd, /\/repo\/read-1\.ts/);
	assert.doesNotMatch(fallback.continuationMd, /Read files:/);
});
