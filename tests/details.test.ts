import test from "node:test";
import assert from "node:assert/strict";
import { buildContinuationDetails, parseContinuationDetails, renderContinuationDetails } from "../extensions/continue/src/details.ts";

test("buildContinuationDetails records current file operations only", () => {
	const details = buildContinuationDetails(
		{
			read: new Set(["/repo/a.ts", "/repo/b.ts"]),
			written: new Set<string>(),
			edited: new Set(["/repo/b.ts", "/repo/c.ts"]),
		},
		"sync-1",
	);
	assert.deepEqual(details.readFiles, ["/repo/a.ts"]);
	assert.deepEqual(details.modifiedFiles, ["/repo/b.ts", "/repo/c.ts"]);
	assert.equal(details.documentSyncId, "sync-1");
});

test("parseContinuationDetails reads the full session details payload", () => {
	const parsed = parseContinuationDetails({
		kind: "pi-continue/v1",
		readFiles: ["/repo/read.ts"],
		modifiedFiles: ["/repo/write.ts"],
		documentSyncId: "sync-2",
	});
	assert.deepEqual(parsed, {
		kind: "pi-continue/v1",
		readFiles: ["/repo/read.ts"],
		modifiedFiles: ["/repo/write.ts"],
		documentSyncId: "sync-2",
	});
});

test("renderContinuationDetails writes compact metadata without file paths", () => {
	const rendered = renderContinuationDetails({
		kind: "pi-continue/v1",
		readFiles: ["/repo/read.ts"],
		modifiedFiles: ["/repo/write.ts"],
		documentSyncId: "sync-3",
	});
	assert.match(rendered, /<continuation-compaction-details>/);
	assert.match(rendered, /"readFileCount": 1/);
	assert.match(rendered, /"modifiedFileCount": 1/);
	assert.match(rendered, /"documentSyncId": "sync-3"/);
	assert.doesNotMatch(rendered, /\/repo\/read\.ts/);
	assert.doesNotMatch(rendered, /\/repo\/write\.ts/);
});
