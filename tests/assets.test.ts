import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadPromptAsset } from "../extensions/continue/src/assets.ts";

test("package history prompts require evidence-gated curated routing", () => {
	for (const path of [
		"assets/system/history_initial.md",
		"assets/system/history_update.md",
		"assets/user/continuation_base.md",
		"assets/user/history_initial.md",
		"assets/user/history_update.md",
	]) {
		const content = readFileSync(path, "utf8");
		assert.match(content, /Must Read/);
		assert.match(content, /Start From Here/);
		assert.match(content, /Evidence Gate/);
	}
	for (const path of ["assets/system/history_initial.md", "assets/system/history_update.md"]) {
		const content = readFileSync(path, "utf8");
		assert.match(content, /noisy evidence, not content to replay/);
		assert.match(content, /Drop provenance-only details/);
		assert.match(content, /Generalize repeated friction/);
	}
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
