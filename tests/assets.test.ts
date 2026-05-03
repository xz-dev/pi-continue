import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadPromptAsset } from "../extensions/continue/src/assets.ts";

const promptAssetPaths = [
	"assets/system/history_initial.md",
	"assets/system/history_update.md",
	"assets/system/split_prefix.md",
	"assets/user/continuation_base.md",
	"assets/user/history_initial.md",
	"assets/user/history_update.md",
	"assets/user/split_prefix.md",
];
const numericReadQuotaPattern = /(?:(?:read|source|file|context|contextMap|bullet|item|entry)s?.{0,24}(?:at most|up to|no more than|maximum|max).{0,16}(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten))|(?:(?:at most|up to|no more than|maximum|max).{0,16}(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten).{0,24}(?:read|source|file|context|contextMap|bullet|item|entry)s?)/i;

test("package history prompts require evidence-gated continuation ledger artifacts without numeric caps", () => {
	for (const path of [
		"assets/system/history_initial.md",
		"assets/system/history_update.md",
		"assets/user/continuation_base.md",
		"assets/user/history_initial.md",
		"assets/user/history_update.md",
	]) {
		const content = readFileSync(path, "utf8");
		assert.match(content, /Pi Continuation Ledger/);
		assert.match(content, /durablePromotions/);
		assert.match(content, /recencyLedger/);
		assert.match(content, /at least one entry|not leave `recencyLedger` empty/);
		assert.match(content, /supersed/i);
		assert.match(content, /contextMap/);
		assert.match(content, /workingEdge/);
		assert.match(content, /durableLearnings/);
		assert.match(content, /agentGuideUpdates/);
		assert.match(content, /agentGuideChangeReason/);
		assert.match(content, /Evidence Gate/);
		assert.doesNotMatch(content, /Read Before Acting/);
		assert.doesNotMatch(content, /Resume Now/);
		assert.doesNotMatch(content, numericReadQuotaPattern);
	}
	for (const path of ["assets/system/history_initial.md", "assets/system/history_update.md", "assets/user/continuation_base.md"]) {
		const content = readFileSync(path, "utf8");
		assert.match(content, /initiativeCharter/);
		assert.match(content, /definitionOfDone/);
		assert.match(content, /recencyLedger/);
		assert.match(content, /currentPlan/);
		assert.match(content, /dormantContext/);
		assert.match(content, /retiredContext/);
		assert.match(content, /inactive is not obsolete/i);
		assert.match(content, /Under token pressure|Keep the ledger dense/);
		assert.match(content, /state ownership model/i);
		assert.match(content, /semantic dominance/i);
		assert.match(content, /one primary/);
	}
	for (const path of ["assets/system/history_initial.md", "assets/system/history_update.md"]) {
		const content = readFileSync(path, "utf8");
		assert.match(content, /pi-continue-artifacts\/v3/);
		assert.match(content, /valid JSON/);
		assert.match(content, /noisy evidence, not content to replay/);
		assert.match(content, /Drop provenance-only details/);
		assert.match(content, /Generalize repeated friction/);
		assert.match(content, /Do not append another stacked ledger layer/);
		assert.match(content, /older await-direction state/);
		assert.match(content, /agent guide/);
	}
});

test("prompt assets avoid raw Markdown HTML tag block lines", () => {
	for (const path of promptAssetPaths) {
		const lines = readFileSync(path, "utf8").split("\n");
		for (let index = 0; index < lines.length; index++) {
			assert.doesNotMatch(lines[index], /^\s*<\/?[a-z][a-z0-9-]*(?:\s+[^>]*)?>\s*$/i, `${path}:${index + 1}`);
		}
	}
});

test("split-prefix prompt keeps runtime-owned wrapper tags", () => {
	const content = readFileSync("assets/system/split_prefix.md", "utf8");
	assert.match(content, /raw summary text/);
	assert.match(content, /runtime owns the saved `<split-prefix>` wrapper/);
	assert.doesNotMatch(content, /Return only one literal tag block/);
	assert.doesNotMatch(content, /<split-prefix>\.\.\.<\/split-prefix>/);
});

test("project override wins when policy is project-override", () => {
	const root = mkdtempSync(join(tmpdir(), "pi-continuation-assets-"));
	try {
		const overrideDir = join(root, ".pi", "extensions", "pi-continue", "prompts", "user");
		mkdirSync(overrideDir, { recursive: true });
		writeFileSync(join(overrideDir, "history_initial.md"), "project override", "utf8");
		const loaded = loadPromptAsset(root, "project-override", "user/history_initial.md");
		assert.equal(loaded.content, "project override");
		assert.equal(loaded.sourcePath, join(overrideDir, "history_initial.md"));
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
