import test from "node:test";
import assert from "node:assert/strict";
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
	assert.match(readme, /Pi package that keeps long Pi runs moving when context fills up mid-run/);
	assert.match(readme, /same-session continuation prompt/);
	assert.match(readme, /native compaction/i);
	assert.match(readme, /Continuation Ledger/);
	assert.match(readme, /custom prompt assets/i);
	assert.match(readme, /Optional repo docs/);
	assert.match(readme, /pi install npm:pi-continue/);
	assert.match(readme, /Only `\/continue` is registered/);
	assert.match(readme, /There are no command aliases/);
	assert.match(readme, /AGENTS\.md sync remain off|automatic AGENTS\.md writes remain off by default/);
	assert.doesNotMatch(readme, /unsafe model call/i);
});

test("documented default config matches runtime and public example", () => {
	const readme = readText("README.md");
	assert.deepEqual(extractJsonFenceAfter(readme, "Default package config:"), DEFAULT_CONTINUE_CONFIG);
	assert.deepEqual(readJson("examples/pi-continue.json"), DEFAULT_CONTINUE_CONFIG);
});

test("AGENTS Pi runtime documentation references exist locally", () => {
	const agents = readText("AGENTS.md");
	const pathMatches = [...agents.matchAll(/`(\/opt\/homebrew\/lib\/node_modules\/@mariozechner\/pi-coding-agent\/docs\/[^`]+\.md)`/g)];
	assert.ok(pathMatches.length > 0);
	for (const match of pathMatches) {
		const path = match[1];
		assert.equal(existsSync(path), true, path);
	}
});

test("package metadata and package contents align with the public contract", () => {
	const packageJson = JSON.parse(readText("package.json"));
	assert.equal(packageJson.name, "pi-continue");
	assert.match(packageJson.description, /Pi extension/);
	assert.match(packageJson.description, /same-session continuation/);
	assert.match(packageJson.description, /native compaction/);
	assert.match(packageJson.description, /Continuation Ledger/);
	assert.deepEqual(packageJson.files, [
		"README.md",
		"AGENTS.md",
		"VISION.md",
		"ARCH.md",
		"LICENSE",
		"assets/",
		"examples/",
		"extensions/",
	]);
	assert.deepEqual(packageJson.pi.extensions, ["./extensions/continue/index.ts"]);
});
