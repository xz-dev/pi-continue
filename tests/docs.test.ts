import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { DEFAULT_CONTINUE_CONFIG } from "../extensions/continue/src/config.ts";

function readText(path: string): string {
	return readFileSync(path, "utf8");
}

function readJson(path: string): unknown {
	return JSON.parse(readText(path));
}

function extractJsonFenceAfter(content: string, marker: string): unknown {
	const markerIndex = content.indexOf(marker);
	assert.notEqual(markerIndex, -1, `missing marker ${marker}`);
	const fenceStart = content.indexOf("```json", markerIndex);
	assert.notEqual(fenceStart, -1, `missing json fence after ${marker}`);
	const jsonStart = content.indexOf("\n", fenceStart) + 1;
	const fenceEnd = content.indexOf("\n```", jsonStart);
	assert.notEqual(fenceEnd, -1, `missing json fence close after ${marker}`);
	return JSON.parse(content.slice(jsonStart, fenceEnd));
}

test("README stays a front-facing product and operator guide", () => {
	const readme = readText("README.md");
	assert.match(readme, /Pi extension package for mid-turn continuation/);
	assert.match(readme, /long Pi tool run fills the context window/);
	assert.match(readme, /same-session resume prompt/);
	assert.match(readme, /native Pi compaction/i);
	assert.match(readme, /Continuation Ledger/);
	assert.match(readme, /handoff prompt|prompt assets/i);
	assert.match(readme, /Per-session artifacts/);
	assert.match(readme, /\.pi\/continue\/.*encoded-session-id/);
	assert.match(readme, /never loads `CONTINUE\.md` or `\.pi\/continue\/\*\.md` as automatic prompt memory/);
	assert.match(readme, /requests tools.*resume-running state.*terminal assistant outcome|resume-running state.*terminal assistant outcome.*toolUse/is);
	assert.match(readme, /persisted compaction summary above the same-session resume prompt/i);
	assert.doesNotMatch(readme, /receiver's first turn/i);
	assert.match(readme, /pi install npm:pi-continue/);
	assert.match(readme, /Only `\/continue` is registered/);
	assert.match(readme, /Inspect and configuration subcommands \(`preview`, `status`, `ledger`, `settings`, `reset`\) use Pi UI\/TUI panels/);
	assert.match(readme, /When UI is unavailable, use `\/continue` or `\/continue steer\|queue` for direct continuation/);
	assert.match(readme, /There are no command aliases/);
	assert.match(readme, /AGENTS\.md sync remain off|[Aa]utomatic AGENTS\.md writes remain off by default/);
	assert.match(readme, /Requires Pi `0\.74\.0` or newer/);
	assert.doesNotMatch(readme, /unsafe model call/i);
});

test("documented default config matches runtime and public example", () => {
	const readme = readText("README.md");
	assert.deepEqual(extractJsonFenceAfter(readme, "Default package config:"), DEFAULT_CONTINUE_CONFIG);
	assert.deepEqual(readJson("examples/pi-continue.json"), DEFAULT_CONTINUE_CONFIG);
});

test("CHANGELOG documents the current package version", () => {
	const changelog = readText("CHANGELOG.md");
	const packageJson = JSON.parse(readText("package.json"));
	const escapedVersion = packageJson.version.replace(/\./g, "\\.");
	assert.match(changelog, new RegExp(`## ${escapedVersion} - `));
	assert.match(changelog, new RegExp(`v${escapedVersion} source tag`));
	assert.match(changelog, /pi-continue-artifacts\/v4/);
	assert.match(changelog, /per-session continuation artifact/i);
});

test("CHANGELOG documents the 0.8.1 patch contract", () => {
	const changelog = readText("CHANGELOG.md");
	assert.match(changelog, /## Unreleased/);
	assert.match(changelog, /## 0\.8\.1 - 2026-05-25/);
	assert.match(changelog, /prompt authority model/i);
	assert.match(changelog, /authoritative factual evidence/i);
	assert.match(changelog, /dynamic handoff-prompt inputs/i);
	assert.match(changelog, /prior-summary, guide, and modeled brief text/i);
	assert.match(changelog, /wrapper tags/i);
	assert.match(changelog, /provider-unsafe kept suffixes/i);
	assert.match(changelog, /matching tool-call IDs/i);
	assert.match(changelog, /toolUse/i);
	assert.match(changelog, /terminal assistant outcome/i);
	assert.match(changelog, /TUI status surfaces/i);
	assert.match(changelog, /shared footer status row/i);
});

test("ignored local Markdown guides stay out of the package corpus", () => {
	const gitignore = readText(".gitignore");
	for (const path of ["CONTINUE.md", "PLAN.md", "AGENTS.md", "ARCH.md", "VISION.md"]) {
		assert.match(gitignore, new RegExp(`(^|\\n)${path.replace(".", "\\.")}(\\n|$)`));
	}
});

test("npm dry-run package contents align with the public contract", () => {
	const output = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { encoding: "utf8" });
	const [candidate] = JSON.parse(output);
	assert.equal(candidate.name, "pi-continue");
	const paths = new Set(candidate.files.map((entry) => entry.path));
	for (const path of [
		"README.md",
		"CHANGELOG.md",
		"LICENSE",
		"assets/system/history_initial.md",
		"assets/user/continuation_base.md",
		"examples/pi-continue.json",
		"extensions/continue/index.ts",
		"extensions/continue/src/synthesis-error.ts",
		"package.json",
	]) {
		assert.equal(paths.has(path), true, `missing package path ${path}`);
	}
	for (const path of [
		"AGENTS.md",
		"CONTINUE.md",
		"PLAN.md",
		"ARCH.md",
		"VISION.md",
		"tests/blocks.test.ts",
		"pnpm-lock.yaml",
		"pnpm-workspace.yaml",
	]) {
		assert.equal(paths.has(path), false, `unexpected package path ${path}`);
	}
});

test("package metadata and package contents align with the public contract", () => {
	const packageJson = JSON.parse(readText("package.json"));
	assert.equal(packageJson.name, "pi-continue");
	assert.equal(packageJson.version, "0.8.1");
	assert.match(packageJson.description, /Mid-turn continuation/);
	assert.match(packageJson.description, /long Pi tool runs/);
	assert.match(packageJson.description, /context overflow/);
	assert.match(packageJson.description, /same session/);
	assert.match(packageJson.description, /handoff ledger/);
	assert.deepEqual(packageJson.keywords, [
		"pi-package",
		"pi-extension",
		"continue",
		"continuation",
		"resume",
		"same-session",
		"mid-turn",
		"mid-run",
		"tool-loop",
		"context-limit",
		"context-window",
		"compaction",
		"handoff",
		"continuation-ledger",
	]);
	assert.deepEqual(packageJson.files, [
		"README.md",
		"CHANGELOG.md",
		"LICENSE",
		"assets/",
		"examples/",
		"extensions/",
	]);
	assert.equal(packageJson.peerDependencies["@earendil-works/pi-ai"], ">=0.74.0");
	assert.equal(packageJson.peerDependencies["@earendil-works/pi-coding-agent"], ">=0.74.0");
	assert.deepEqual(packageJson.pi.extensions, ["./extensions/continue/index.ts"]);
	assert.equal(packageJson.pi.image, "https://raw.githubusercontent.com/Tiziano-AI/pi-continue/v0.8.1/assets/gallery/pi-continue-gallery.webp");
	assert.equal(existsSync("assets/gallery/pi-continue-gallery.webp"), true);
});
