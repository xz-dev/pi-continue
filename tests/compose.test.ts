import test from "node:test";
import assert from "node:assert/strict";
import { composeCompactionSummary } from "../extensions/continue/src/compose.ts";
import type { ContinuationCompactionDetails } from "../extensions/continue/src/types.ts";

const details: ContinuationCompactionDetails = {
	kind: "pi-continue/v4",
	readFiles: ["/repo/read.ts"],
	modifiedFiles: ["/repo/write.ts"],
	documentSyncId: "sync-1",
	agentGuideSyncId: "guide-1",
};

test("composeCompactionSummary wraps the brief in <continuation> with no fallback paths", () => {
	const summary = composeCompactionSummary("continue", details, {
		appendCompactionMetadata: false,
		appendReadFileTags: false,
		appendModifiedFileTags: false,
	});
	assert.match(summary, /<continuation>\ncontinue\n<\/continuation>/);
	assert.doesNotMatch(summary, /<split-prefix>/);
	assert.doesNotMatch(summary, /<read-files>/);
	assert.doesNotMatch(summary, /readFileCount/);
});

test("composeCompactionSummary can append compaction metadata without file paths", () => {
	const summary = composeCompactionSummary("continue", details, {
		appendCompactionMetadata: true,
		appendReadFileTags: false,
		appendModifiedFileTags: false,
	});
	assert.match(summary, /<continuation>\ncontinue\n<\/continuation>/);
	assert.match(summary, /"readFileCount": 1/);
	assert.match(summary, /"modifiedFileCount": 1/);
	assert.match(summary, /"agentGuideSyncId": "guide-1"/);
	assert.doesNotMatch(summary, /<read-files>/);
	assert.doesNotMatch(summary, /\/repo\/read\.ts/);
	assert.doesNotMatch(summary, /\/repo\/write\.ts/);
});

test("composeCompactionSummary renders read and modified path tags independently", () => {
	const modifiedOnly = composeCompactionSummary("continue", details, {
		appendCompactionMetadata: false,
		appendReadFileTags: false,
		appendModifiedFileTags: true,
	});
	assert.doesNotMatch(modifiedOnly, /<read-files>/);
	assert.match(modifiedOnly, /<modified-files>\n\/repo\/write\.ts\n<\/modified-files>/);
	assert.doesNotMatch(modifiedOnly, /readFileCount/);

	const readOnly = composeCompactionSummary("continue", details, {
		appendCompactionMetadata: false,
		appendReadFileTags: true,
		appendModifiedFileTags: false,
	});
	assert.match(readOnly, /<read-files>\n\/repo\/read\.ts\n<\/read-files>/);
	assert.doesNotMatch(readOnly, /<modified-files>/);
	assert.doesNotMatch(readOnly, /readFileCount/);
});
