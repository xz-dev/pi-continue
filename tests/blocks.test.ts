import test from "node:test";
import assert from "node:assert/strict";
import { parseHistoryArtifacts } from "../extensions/continue/src/blocks.ts";

function briefEnvelope(overrides: Record<string, unknown> = {}) {
	return {
		task: "Finish the v4 continuation ledger cutover.",
		done_when: "All gates pass and the README, CHANGELOG, and assets describe pi-continue-artifacts/v4 only.",
		forbid: [
			{ rule: "Do not introduce a v3 migration shim.", source: "user@msg-design-decision" },
			{ rule: "Do not edit vendor/ paths.", source: "user@msg-vendor-lock" },
		],
		established: [
			{
				claim: "Finding 7 (duplicate channel) is invalid: delegation.test.ts covers it deterministically.",
				evidence: "tests/delegation.test.ts:142",
				basis: "test",
				reopen: "if tests/delegation.test.ts changes around line 142",
			},
			{
				claim: "Cross-service eventing uses queues, not pubsub.",
				evidence: "user@msg-arch-decision: 'use queues; pubsub loses messages we cannot lose'",
				basis: "user",
				reopen: "none",
			},
		],
		learned: [
			{
				lesson: "When a brief field is stuffed with embedded newlines, the next render cycle re-atomizes it into spurious entries.",
				source: "session experience: L1047 explosion observed during v4 stabilization",
			},
		],
		open: [
			{
				question: "Does the gate pass after the v4 schema rewrite?",
				verifies: "Run pnpm run gate and observe exit 0.",
			},
		],
		next: [
			{
				action: "Run pnpm run gate from the repo root.",
				outcome: "Either exit 0 (close the open verifies) or a concrete failure to triage.",
			},
		],
		...overrides,
	};
}

function envelope(overrides: Record<string, unknown> = {}) {
	return {
		version: "pi-continue-artifacts/v4",
		brief: briefEnvelope(),
		agentGuideUpdate: { content: null, reason: "no durable guide change this cycle" },
		...overrides,
	};
}

const validArtifacts = JSON.stringify(envelope());

test("parseHistoryArtifacts requires the v4 structured JSON artifact contract", () => {
	assert.equal(parseHistoryArtifacts("<continuation>one</continuation>"), undefined);
	const parsed = parseHistoryArtifacts(validArtifacts);
	assert.deepEqual(parsed, {
		briefMarkdown: [
			"## Task\nFinish the v4 continuation ledger cutover.",
			"## Done When\nAll gates pass and the README, CHANGELOG, and assets describe pi-continue-artifacts/v4 only.",
			"## Forbid\n- Do not introduce a v3 migration shim. — source: user@msg-design-decision\n- Do not edit vendor/ paths. — source: user@msg-vendor-lock",
			"## Established\n- Finding 7 (duplicate channel) is invalid: delegation.test.ts covers it deterministically. — evidence: tests/delegation.test.ts:142; basis: test; reopen: if tests/delegation.test.ts changes around line 142\n- Cross-service eventing uses queues, not pubsub. — evidence: user@msg-arch-decision: 'use queues; pubsub loses messages we cannot lose'; basis: user; reopen: none",
			"## Learned\n- When a brief field is stuffed with embedded newlines, the next render cycle re-atomizes it into spurious entries. — source: session experience: L1047 explosion observed during v4 stabilization",
			"## Open\n- Does the gate pass after the v4 schema rewrite? — verifies: Run pnpm run gate and observe exit 0.",
			"## Next\n- Run pnpm run gate from the repo root. → Either exit 0 (close the open verifies) or a concrete failure to triage.",
		].join("\n\n"),
		agentGuideMd: undefined,
		agentGuideChangeReason: "no durable guide change this cycle",
	});
});

test("parseHistoryArtifacts renders only populated brief sections (empty arrays accepted)", () => {
	const parsed = parseHistoryArtifacts(JSON.stringify(envelope({
		brief: briefEnvelope({ forbid: [], established: [], learned: [], open: [], next: [] }),
	})));
	assert.equal(parsed?.briefMarkdown, [
		"## Task\nFinish the v4 continuation ledger cutover.",
		"## Done When\nAll gates pass and the README, CHANGELOG, and assets describe pi-continue-artifacts/v4 only.",
	].join("\n\n"));
});

test("parseHistoryArtifacts accepts a full agent guide replacement", () => {
	const parsed = parseHistoryArtifacts(JSON.stringify(envelope({
		agentGuideUpdate: { content: "# AGENTS\n", reason: "capture corrected command truth" },
	})));
	assert.equal(parsed?.agentGuideMd, "# AGENTS");
	assert.equal(parsed?.agentGuideChangeReason, "capture corrected command truth");
});

test("parseHistoryArtifacts rejects the retired v3 envelope", () => {
	assert.equal(parseHistoryArtifacts(JSON.stringify({
		version: "pi-continue-artifacts/v3",
		brief: briefEnvelope(),
		document: "doc",
		agentGuideMarkdown: null,
		agentGuideChangeReason: "v3 shape",
	})), undefined);
});

test("parseHistoryArtifacts rejects envelopes with a retired document field", () => {
	assert.equal(parseHistoryArtifacts(JSON.stringify({
		version: "pi-continue-artifacts/v4",
		brief: briefEnvelope(),
		document: "# Continuation\n\nresidual document from prior schema.",
		agentGuideUpdate: { content: null, reason: "ok" },
	})), undefined);
});

test("parseHistoryArtifacts rejects wrong top-level keys", () => {
	assert.equal(parseHistoryArtifacts(JSON.stringify({
		version: "pi-continue-artifacts/v4",
		brief: briefEnvelope(),
		agentGuideUpdate: { content: null, reason: "ok" },
		extra: "noise",
	})), undefined);
});

test("parseHistoryArtifacts rejects wrong brief keys", () => {
	assert.equal(parseHistoryArtifacts(JSON.stringify(envelope({
		brief: { ...briefEnvelope(), extraSlot: ["nope"] },
	}))), undefined);
});

test("parseHistoryArtifacts rejects brief missing the learned slot", () => {
	const noLearned = briefEnvelope();
	delete (noLearned as Record<string, unknown>).learned;
	assert.equal(parseHistoryArtifacts(JSON.stringify(envelope({ brief: noLearned }))), undefined);
});

test("parseHistoryArtifacts rejects empty task or done_when", () => {
	assert.equal(parseHistoryArtifacts(JSON.stringify(envelope({
		brief: briefEnvelope({ task: "" }),
	}))), undefined);
	assert.equal(parseHistoryArtifacts(JSON.stringify(envelope({
		brief: briefEnvelope({ done_when: "   " }),
	}))), undefined);
});

test("parseHistoryArtifacts rejects forbid entries missing fields", () => {
	assert.equal(parseHistoryArtifacts(JSON.stringify(envelope({
		brief: briefEnvelope({ forbid: [{ rule: "no source attribution" }] }),
	}))), undefined);
	assert.equal(parseHistoryArtifacts(JSON.stringify(envelope({
		brief: briefEnvelope({ forbid: [{ rule: "ok", source: "" }] }),
	}))), undefined);
});

test("parseHistoryArtifacts rejects established basis not in enum", () => {
	assert.equal(parseHistoryArtifacts(JSON.stringify(envelope({
		brief: briefEnvelope({
			established: [{
				claim: "ok",
				evidence: "path:1",
				basis: "hearsay",
				reopen: "none",
			}],
		}),
	}))), undefined);
});

test("parseHistoryArtifacts rejects established entries missing fields", () => {
	assert.equal(parseHistoryArtifacts(JSON.stringify(envelope({
		brief: briefEnvelope({
			established: [{ claim: "ok", evidence: "path:1", basis: "test" }],
		}),
	}))), undefined);
	assert.equal(parseHistoryArtifacts(JSON.stringify(envelope({
		brief: briefEnvelope({
			established: [{ claim: "ok", evidence: "", basis: "test", reopen: "none" }],
		}),
	}))), undefined);
});

test("parseHistoryArtifacts rejects learned entries missing fields", () => {
	assert.equal(parseHistoryArtifacts(JSON.stringify(envelope({
		brief: briefEnvelope({ learned: [{ lesson: "no source" }] }),
	}))), undefined);
	assert.equal(parseHistoryArtifacts(JSON.stringify(envelope({
		brief: briefEnvelope({ learned: [{ lesson: "ok", source: "" }] }),
	}))), undefined);
});

test("parseHistoryArtifacts rejects learned entries with extra keys", () => {
	assert.equal(parseHistoryArtifacts(JSON.stringify(envelope({
		brief: briefEnvelope({ learned: [{ lesson: "ok", source: "user@msg-1", evidence: "noise" }] }),
	}))), undefined);
});

test("parseHistoryArtifacts rejects open entries missing fields", () => {
	assert.equal(parseHistoryArtifacts(JSON.stringify(envelope({
		brief: briefEnvelope({ open: [{ question: "ok" }] }),
	}))), undefined);
	assert.equal(parseHistoryArtifacts(JSON.stringify(envelope({
		brief: briefEnvelope({ open: [{ question: "ok", verifies: "" }] }),
	}))), undefined);
});

test("parseHistoryArtifacts rejects next entries missing fields", () => {
	assert.equal(parseHistoryArtifacts(JSON.stringify(envelope({
		brief: briefEnvelope({ next: [{ action: "ok" }] }),
	}))), undefined);
	assert.equal(parseHistoryArtifacts(JSON.stringify(envelope({
		brief: briefEnvelope({ next: [{ action: "ok", outcome: "" }] }),
	}))), undefined);
});

test("parseHistoryArtifacts rejects agentGuideUpdate with wrong keys", () => {
	assert.equal(parseHistoryArtifacts(JSON.stringify(envelope({
		agentGuideUpdate: { content: null, reason: "ok", extra: true },
	}))), undefined);
	assert.equal(parseHistoryArtifacts(JSON.stringify(envelope({
		agentGuideUpdate: { reason: "missing content" },
	}))), undefined);
});

test("parseHistoryArtifacts rejects agentGuideUpdate.content empty string (must be null or non-empty)", () => {
	assert.equal(parseHistoryArtifacts(JSON.stringify(envelope({
		agentGuideUpdate: { content: "   ", reason: "empty content rejected" },
	}))), undefined);
});

test("parseHistoryArtifacts rejects empty agentGuideUpdate.reason", () => {
	assert.equal(parseHistoryArtifacts(JSON.stringify(envelope({
		agentGuideUpdate: { content: null, reason: "" },
	}))), undefined);
	assert.equal(parseHistoryArtifacts(JSON.stringify(envelope({
		agentGuideUpdate: { content: null, reason: null },
	}))), undefined);
});

test("parseHistoryArtifacts collapses multi-line/embedded-bullet field values to single lines", () => {
	// Simulates a synthesizer that stuffed a multi-line finding into an `open.question`.
	// Round-trip rendering must NOT produce nested markdown bullets that the next
	// cycle parses as separate entries (the L1047 explosion mode).
	const pathological = JSON.stringify(envelope({
		brief: briefEnvelope({
			open: [{
				question: "Finding 1: RPC child success ignores non-success stopReason\n  - rpc-child-controller.ts:234\n  - rpc-record-utils.ts:12\n  - Fix: parse stopReason",
				verifies: "Read both files\nand add tests",
			}],
		}),
	}));
	const parsed = parseHistoryArtifacts(pathological);
	assert.equal(
		parsed?.briefMarkdown.includes("\n  - "),
		false,
		"rendered brief must not contain nested bullet markers that the next synthesizer would re-atomize",
	);
	assert.match(
		parsed?.briefMarkdown ?? "",
		/## Open\n- Finding 1: RPC child success ignores non-success stopReason rpc-child-controller\.ts:234 rpc-record-utils\.ts:12 Fix: parse stopReason — verifies: Read both files and add tests/,
	);
});
