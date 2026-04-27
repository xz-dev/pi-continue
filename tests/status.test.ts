import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONTINUE_CONFIG } from "../extensions/continue/src/config.ts";
import { renderStatus } from "../extensions/continue/src/status.ts";

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
		);
		assert.match(rendered, /# Continuation Status/);
		assert.match(rendered, /- Model: inherit -> openai\/gpt-test/);
		assert.match(rendered, /- Agent guide writes: off/);
		assert.match(rendered, /Durable promotions are normal-work proposals, not compaction write proof/);
		assert.match(rendered, /- Scenario: unavailable/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
