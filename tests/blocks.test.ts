import test from "node:test";
import assert from "node:assert/strict";
import { parseHistoryArtifacts, parseSplitPrefix } from "../extensions/continue/src/blocks.ts";

test("parseHistoryArtifacts requires both blocks", () => {
	assert.equal(parseHistoryArtifacts("<continuation>one</continuation>"), undefined);
	assert.deepEqual(parseHistoryArtifacts("<continuation>one</continuation>\n<continuation-md>two</continuation-md>"), {
		continuation: "one",
		continuationMd: "two",
	});
});

test("parseSplitPrefix extracts tagged payload", () => {
	assert.equal(parseSplitPrefix("<split-prefix>prefix</split-prefix>"), "prefix");
});
