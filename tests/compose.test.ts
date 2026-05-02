import test from "node:test";
import assert from "node:assert/strict";
import { composeCompactionSummary } from "../extensions/continue/src/compose.ts";
import type { ContinuationCompactionDetails } from "../extensions/continue/src/types.ts";

const details: ContinuationCompactionDetails = {
	kind: "pi-continue/v3",
	readFiles: ["/repo/read.ts"],
	modifiedFiles: ["/repo/write.ts"],
	documentSyncId: "sync-1",
	agentGuideSyncId: "guide-1",
};

test("composeCompactionSummary can append compact metadata without file paths", () => {
	const summary = composeCompactionSummary("continue", undefined, details, {
		appendCompactionMetadata: true,
		appendFileTags: false,
	});
	assert.match(summary, /<continuation>\ncontinue\n<\/continuation>/);
	assert.match(summary, /"readFileCount": 1/);
	assert.match(summary, /"modifiedFileCount": 1/);
	assert.match(summary, /"agentGuideSyncId": "guide-1"/);
	assert.doesNotMatch(summary, /<read-files>/);
	assert.doesNotMatch(summary, /\/repo\/read\.ts/);
	assert.doesNotMatch(summary, /\/repo\/write\.ts/);
});

test("composeCompactionSummary renders path tags only when explicitly enabled", () => {
	const summary = composeCompactionSummary("continue", undefined, details, {
		appendCompactionMetadata: false,
		appendFileTags: true,
	});
	assert.match(summary, /<read-files>\n\/repo\/read\.ts\n<\/read-files>/);
	assert.match(summary, /<modified-files>\n\/repo\/write\.ts\n<\/modified-files>/);
	assert.doesNotMatch(summary, /readFileCount/);
});
