import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONTINUE_CONFIG } from "../extensions/continue/src/config.ts";
import { renderStatus } from "../extensions/continue/src/status.ts";
import type { ContinuationLatestEvent } from "../extensions/continue/src/types.ts";

test("renderStatus reports local runtime wiring and write semantics", () => {
	const root = mkdtempSync(join(tmpdir(), "pi-continuation-status-"));
	try {
		const ctx = {
			model: {
				provider: "openai",
				id: "gpt-test",
				contextWindow: 1000,
			},
		};
		const rendered = renderStatus(
			ctx,
			DEFAULT_CONTINUE_CONFIG,
			root,
			join(root, "CONTINUE.md"),
			join(root, "AGENTS.md"),
			undefined,
			undefined,
		);
		assert.match(rendered, /# Continuation Status/);
		assert.match(rendered, /## Continuation Aftercare/);
		assert.match(rendered, /Last continuation: none recorded since this extension loaded/);
		assert.match(rendered, /- Model: inherit -> openai\/gpt-test/);
		assert.match(rendered, /- Agent guide writes: off/);
		assert.match(rendered, /Durable promotions are normal-work proposals, not compaction write proof/);
		assert.match(rendered, /- Scenario: unavailable/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("renderStatus summarizes a completed latest continuation calmly", () => {
	const root = mkdtempSync(join(tmpdir(), "pi-continuation-status-"));
	try {
		const ctx = {
			model: {
				provider: "openai",
				id: "gpt-test",
				contextWindow: 1000,
			},
		};
		const latestEvent: ContinuationLatestEvent = {
			id: "continue-1",
			source: "mid-run-guard",
			status: "completed",
			startedAt: 0,
			completedAt: 1000,
			trigger: {
				estimatedTokens: 820,
				thresholdTokens: 750,
				contextWindow: 1000,
				reserveTokens: 250,
				usageTokens: 800,
				trailingTokens: 20,
				lastUsageIndex: 3,
			},
			artifactStatus: "modeled",
			promptStatus: "sent",
			documentSync: {
				continuationDoc: "off",
				agentGuide: "off",
			},
		};
		const rendered = renderStatus(
			ctx,
			DEFAULT_CONTINUE_CONFIG,
			root,
			join(root, "CONTINUE.md"),
			join(root, "AGENTS.md"),
			undefined,
			latestEvent,
		);
		assert.match(rendered, /Last continuation: completed successfully/);
		assert.match(rendered, /Checkpoint: completed assistant\/tool-result batch before the next provider request/);
		assert.match(rendered, /Artifact: Continuation Ledger parsed successfully/);
		assert.match(rendered, /Document writes: none performed/);
		assert.match(rendered, /Action: No action needed/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("renderStatus does not call pending or failed sync no-op writes", () => {
	const root = mkdtempSync(join(tmpdir(), "pi-continuation-status-"));
	try {
		const ctx = {
			model: {
				provider: "openai",
				id: "gpt-test",
				contextWindow: 1000,
			},
		};
		const latestEvent: ContinuationLatestEvent = {
			id: "continue-2",
			source: "command-steer",
			status: "failed",
			startedAt: 0,
			completedAt: 1000,
			artifactStatus: "fallback",
			promptStatus: "failed",
			documentSync: {
				continuationDoc: "failed",
				agentGuide: "pending",
			},
			failureReason: "Document sync failed; check the configured path and permissions.",
		};
		const rendered = renderStatus(
			ctx,
			DEFAULT_CONTINUE_CONFIG,
			root,
			join(root, "CONTINUE.md"),
			join(root, "AGENTS.md"),
			undefined,
			latestEvent,
		);
		assert.match(rendered, /Document sync: continuation doc failed; agent guide pending/);
		assert.match(rendered, /Continuation prompt: not sent/);
		assert.match(rendered, /Attention: Document sync failed; check the configured path and permissions/);
		assert.doesNotMatch(rendered, /Document writes: none performed/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
