import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { homedir } from "node:os";
import { resolveAgentDir } from "../extensions/continue/src/agent-dir.ts";

async function withAgentEnv(env, work) {
	const previousCodingAgentDir = process.env.PI_CODING_AGENT_DIR;
	const previousAgentDir = process.env.PI_AGENT_DIR;
	if (env.PI_CODING_AGENT_DIR === undefined) {
		delete process.env.PI_CODING_AGENT_DIR;
	} else {
		process.env.PI_CODING_AGENT_DIR = env.PI_CODING_AGENT_DIR;
	}
	if (env.PI_AGENT_DIR === undefined) {
		delete process.env.PI_AGENT_DIR;
	} else {
		process.env.PI_AGENT_DIR = env.PI_AGENT_DIR;
	}
	try {
		await work();
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
	}
}

test("resolveAgentDir prefers PI_CODING_AGENT_DIR over legacy PI_AGENT_DIR", async () => {
	await withAgentEnv({ PI_CODING_AGENT_DIR: "/tmp/new-agent", PI_AGENT_DIR: "/tmp/legacy-agent" }, async () => {
		assert.equal(resolveAgentDir(), "/tmp/new-agent");
	});
});

test("resolveAgentDir preserves legacy PI_AGENT_DIR fallback", async () => {
	await withAgentEnv({ PI_CODING_AGENT_DIR: undefined, PI_AGENT_DIR: "/tmp/legacy-agent" }, async () => {
		assert.equal(resolveAgentDir(), "/tmp/legacy-agent");
	});
});

test("resolveAgentDir defaults to ~/.pi/agent", async () => {
	await withAgentEnv({ PI_CODING_AGENT_DIR: undefined, PI_AGENT_DIR: undefined }, async () => {
		assert.equal(resolveAgentDir(), join(homedir(), ".pi", "agent"));
	});
});
