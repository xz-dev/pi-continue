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
			resume: {
				status: "completed",
				startedAt: 500,
				completedAt: 900,
				stopReason: "stop",
				requestedModel: "openai/gpt-test",
				responseModel: "openai/gpt-routed",
			},
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

test("renderStatus reports compaction failure without failed-resume copy", () => {
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
			artifactStatus: "pending",
			promptStatus: "failed",
			resume: { status: "not-requested" },
			documentSync: {
				continuationDoc: "off",
				agentGuide: "off",
			},
			failureReason: "Summarizer provider failed; check model, authentication, or context settings.",
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
		assert.match(rendered, /Last continuation: continuation needs attention/);
		assert.match(rendered, /Resume outcome: not requested/);
		assert.doesNotMatch(rendered, /resume needs attention/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("renderStatus reports an aborted resume without generic internal failure copy", () => {
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
			id: "continue-3",
			source: "command-steer",
			status: "failed",
			startedAt: 0,
			completedAt: 1000,
			artifactStatus: "modeled",
			promptStatus: "sent",
			resume: {
				status: "aborted",
				startedAt: 200,
				completedAt: 900,
				failureReason: "Continuation resume was aborted.",
			},
			documentSync: {
				continuationDoc: "off",
				agentGuide: "off",
			},
			failureReason: "Continuation resume was aborted.",
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
		assert.match(rendered, /Last continuation: resume was aborted/);
		assert.match(rendered, /Attention: Continuation resume was aborted/);
		assert.doesNotMatch(rendered, /internal failure/);
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
			resume: {
				status: "failed",
				failureReason: "Continuation prompt dispatch failed.",
			},
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
