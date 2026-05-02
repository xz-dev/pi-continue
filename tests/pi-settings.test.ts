import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readEffectivePiCompactionSettings } from "../extensions/continue/src/pi-settings.ts";

async function withTempAgent(work) {
	const root = mkdtempSync(join(tmpdir(), "pi-continue-settings-"));
	const previousCodingAgentDir = process.env.PI_CODING_AGENT_DIR;
	const previousAgentDir = process.env.PI_AGENT_DIR;
	process.env.PI_CODING_AGENT_DIR = join(root, "agent");
	delete process.env.PI_AGENT_DIR;
	try {
		return await work(root);
	} finally {
		if (previousCodingAgentDir === undefined) {
			delete process.env.PI_CODING_AGENT_DIR;
		} else {
			process.env.PI_CODING_AGENT_DIR = previousCodingAgentDir;
		}
		if (previousAgentDir === undefined) {
			delete process.env.PI_AGENT_DIR;
		} else {
			process.env.PI_AGENT_DIR = previousAgentDir;
		}
		rmSync(root, { recursive: true, force: true });
	}
}

test("readEffectivePiCompactionSettings defaults to Pi core compaction settings", async () => {
	await withTempAgent(async (root) => {
		assert.deepEqual(readEffectivePiCompactionSettings(root), {
			enabled: true,
			reserveTokens: 68000,
			keepRecentTokens: 20000,
		});
	});
});

test("readEffectivePiCompactionSettings lets project settings override Pi core defaults", async () => {
	await withTempAgent(async (root) => {
		const settingsDir = join(root, ".pi");
		mkdirSync(settingsDir, { recursive: true });
		writeFileSync(
			join(settingsDir, "settings.json"),
			JSON.stringify({ compaction: { enabled: false, reserveTokens: 12345, keepRecentTokens: 6789 } }),
			"utf8",
		);
		assert.deepEqual(readEffectivePiCompactionSettings(root), {
			enabled: false,
			reserveTokens: 12345,
			keepRecentTokens: 6789,
		});
	});
});

test("readEffectivePiCompactionSettings rejects malformed Pi settings", async () => {
	await withTempAgent(async (root) => {
		const settingsDir = join(root, ".pi");
		mkdirSync(settingsDir, { recursive: true });
		writeFileSync(join(settingsDir, "settings.json"), "{", "utf8");
		assert.throws(() => readEffectivePiCompactionSettings(root), /Failed to read Pi settings/);
	});
});
