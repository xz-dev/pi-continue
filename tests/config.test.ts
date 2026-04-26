import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONTINUE_CONFIG, loadContinuationConfig, loadScopeConfig, resetContinuationConfig, saveContinuationConfig } from "../extensions/continue/src/config.ts";

async function withTempAgent(work) {
	const root = mkdtempSync(join(tmpdir(), "pi-continuation-config-"));
	const previousCodingAgentDir = process.env.PI_CODING_AGENT_DIR;
	const previousAgentDir = process.env.PI_AGENT_DIR;
	delete process.env.PI_CODING_AGENT_DIR;
	process.env.PI_AGENT_DIR = join(root, "agent");
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

test("loadContinuationConfig uses current-session model, reasoning, guard, and sync defaults", async () => {
	await withTempAgent(async (root) => {
		const config = loadContinuationConfig(root);
		assert.equal(config.summarizerModel, "inherit");
		assert.equal(config.reasoning, "inherit");
		assert.equal(config.continuationDocSyncMode, "off");
		assert.equal(config.agentGuidePath, "AGENTS.md");
		assert.equal(config.agentGuideSyncMode, "off");
		assert.equal(config.midRunGuardEnabled, true);
		assert.equal(config.appendCompactionMetadata, false);
		assert.equal(config.appendFileTags, false);
	});
});

test("loadContinuationConfig preserves explicit mid-run guard false", async () => {
	await withTempAgent(async (root) => {
		const configDir = join(root, ".pi", "extensions");
		mkdirSync(configDir, { recursive: true });
		writeFileSync(join(configDir, "pi-continue.json"), JSON.stringify({ midRunGuardEnabled: false }), "utf8");
		const config = loadContinuationConfig(root);
		assert.equal(config.midRunGuardEnabled, false);
	});
});

test("loadContinuationConfig preserves explicit repo document sync settings", async () => {
	await withTempAgent(async (root) => {
		const configDir = join(root, ".pi", "extensions");
		mkdirSync(configDir, { recursive: true });
		writeFileSync(join(configDir, "pi-continue.json"), JSON.stringify({
			continuationDocSyncMode: "always",
			agentGuidePath: "docs/AGENTS.md",
			agentGuideSyncMode: "always",
		}), "utf8");
		const config = loadContinuationConfig(root);
		assert.equal(config.continuationDocSyncMode, "always");
		assert.equal(config.agentGuidePath, "docs/AGENTS.md");
		assert.equal(config.agentGuideSyncMode, "always");
	});
});

test("loadScopeConfig keeps global and project settings separate", async () => {
	await withTempAgent(async (root) => {
		await saveContinuationConfig("global", root, {
			...DEFAULT_CONTINUE_CONFIG,
			summarizerModel: "openai/global-model",
		});
		await saveContinuationConfig("project", root, {
			...DEFAULT_CONTINUE_CONFIG,
			summarizerModel: "openai/project-model",
		});
		assert.equal(loadContinuationConfig(root).summarizerModel, "openai/project-model");
		assert.equal(loadScopeConfig("global", root).summarizerModel, "openai/global-model");
		assert.equal(loadScopeConfig("project", root).summarizerModel, "openai/project-model");
	});
});

test("loadContinuationConfig rejects malformed config", async () => {
	await withTempAgent(async (root) => {
		const configDir = join(root, ".pi", "extensions");
		mkdirSync(configDir, { recursive: true });
		writeFileSync(join(configDir, "pi-continue.json"), "{", "utf8");
		assert.throws(() => loadContinuationConfig(root), /Failed to read pi-continue config/);
	});
});

test("save and reset round-trip the mid-run guard setting", async () => {
	await withTempAgent(async (root) => {
		await saveContinuationConfig("project", root, {
			...DEFAULT_CONTINUE_CONFIG,
			midRunGuardEnabled: false,
		});
		assert.equal(loadContinuationConfig(root).midRunGuardEnabled, false);
		await resetContinuationConfig("project", root);
		assert.equal(loadContinuationConfig(root).midRunGuardEnabled, true);
		assert.equal(loadContinuationConfig(root).continuationDocSyncMode, "off");
		assert.equal(loadContinuationConfig(root).agentGuideSyncMode, "off");
	});
});
