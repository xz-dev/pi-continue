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
	assert.match(readme, /customizable compact prompt|prompt assets/i);
	assert.match(readme, /Optional repo docs/);
	assert.match(readme, /pi install npm:pi-continue/);
	assert.match(readme, /Only `\/continue` is registered/);
	assert.match(readme, /There are no command aliases/);
	assert.match(readme, /AGENTS\.md sync remain off|[Aa]utomatic AGENTS\.md writes remain off by default/);
	assert.doesNotMatch(readme, /unsafe model call/i);
});

test("documented default config matches runtime and public example", () => {
	const readme = readText("README.md");
	assert.deepEqual(extractJsonFenceAfter(readme, "Default package config:"), DEFAULT_CONTINUE_CONFIG);
	assert.deepEqual(readJson("examples/pi-continue.json"), DEFAULT_CONTINUE_CONFIG);
});

test("ignored local Markdown guides stay out of the package corpus", () => {
	const gitignore = readText(".gitignore");
	for (const path of ["CONTINUE.md", "PLAN.md", "AGENTS.md", "ARCH.md", "VISION.md"]) {
		assert.match(gitignore, new RegExp(`(^|\\n)${path.replace(".", "\\.")}(\\n|$)`));
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
		"LICENSE",
		"assets/",
		"examples/",
		"extensions/",
	]);
	assert.equal(packageJson.peerDependencies["@mariozechner/pi-ai"], ">=0.72.0");
	assert.equal(packageJson.peerDependencies["@mariozechner/pi-coding-agent"], ">=0.72.0");
	assert.deepEqual(packageJson.pi.extensions, ["./extensions/continue/index.ts"]);
	assert.equal(packageJson.pi.image, "https://raw.githubusercontent.com/Tiziano-AI/pi-continue/v0.5.0/assets/gallery/pi-continue-gallery.webp");
	assert.equal(existsSync("assets/gallery/pi-continue-gallery.webp"), true);
});
