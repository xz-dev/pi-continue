import test from "node:test";
import assert from "node:assert/strict";
import { parseHistoryArtifacts, parseSplitPrefix } from "../extensions/continue/src/blocks.ts";

function structuredArtifact(overrides = {}) {
	return {
		task: "Finish the approved continuation redesign.",
		state: ["Runtime contract changed."],
		decisions: ["Single /continue command."],
		contextMap: [{ source: "/repo/ARCH.md", relevance: "architecture contract", use: "verify runtime boundaries" }],
		workingEdge: ["Update tests and docs, then run the gate."],
		validation: ["pnpm test is stale after edits."],
		risks: ["Do not preserve mandatory read/do headings."],
		antiRework: ["Do not re-run external research already summarized."],
		durableLearnings: ["Avoid renaming weak constraints instead of redesigning the contract."],
		agentGuideUpdates: ["Capture durable prompt-contract rules if guide sync is enabled."],
		...overrides,
	};
}

const validArtifacts = JSON.stringify({
	version: "pi-continue-artifacts/v2",
	brief: structuredArtifact(),
	document: structuredArtifact({ state: ["Document carries broader durable state."] }),
	agentGuideMarkdown: null,
	agentGuideChangeReason: "no durable guide change",
});

test("parseHistoryArtifacts requires the v2 structured JSON artifact contract", () => {
	assert.equal(parseHistoryArtifacts("<continuation>one</continuation>"), undefined);
	assert.deepEqual(parseHistoryArtifacts(validArtifacts), {
		continuation: [
			"## Task\nFinish the approved continuation redesign.",
			"## Current State\n- Runtime contract changed.",
			"## Decisions and Constraints\n- Single /continue command.",
			"## Context Map\n- /repo/ARCH.md — architecture contract; use it to verify runtime boundaries.",
			"## Working Edge\n- Update tests and docs, then run the gate.",
			"## Validation\n- pnpm test is stale after edits.",
			"## Risks\n- Do not preserve mandatory read/do headings.",
			"## Anti-Rework\n- Do not re-run external research already summarized.",
			"## Durable Learnings\n- Avoid renaming weak constraints instead of redesigning the contract.",
			"## Agent Guide Updates\n- Capture durable prompt-contract rules if guide sync is enabled.",
		].join("\n\n"),
		continuationMd: [
			"# Continuation",
			"## Task\nFinish the approved continuation redesign.",
			"## Current State\n- Document carries broader durable state.",
			"## Decisions and Constraints\n- Single /continue command.",
			"## Context Map\n- /repo/ARCH.md — architecture contract; use it to verify runtime boundaries.",
			"## Working Edge\n- Update tests and docs, then run the gate.",
			"## Validation\n- pnpm test is stale after edits.",
			"## Risks\n- Do not preserve mandatory read/do headings.",
			"## Anti-Rework\n- Do not re-run external research already summarized.",
			"## Durable Learnings\n- Avoid renaming weak constraints instead of redesigning the contract.",
			"## Agent Guide Updates\n- Capture durable prompt-contract rules if guide sync is enabled.",
		].join("\n\n"),
		agentGuideMd: undefined,
		agentGuideChangeReason: "no durable guide change",
	});
});

test("parseHistoryArtifacts accepts a full agent guide replacement", () => {
	const parsed = parseHistoryArtifacts(JSON.stringify({
		version: "pi-continue-artifacts/v2",
		brief: structuredArtifact(),
		document: structuredArtifact(),
		agentGuideMarkdown: "# AGENTS\n",
		agentGuideChangeReason: "capture corrected command truth",
	}));
	assert.equal(parsed?.agentGuideMd, "# AGENTS");
	assert.equal(parsed?.agentGuideChangeReason, "capture corrected command truth");
});

test("parseHistoryArtifacts rejects missing structured fields", () => {
	assert.equal(parseHistoryArtifacts(JSON.stringify({
		version: "pi-continue-artifacts/v2",
		brief: { task: "missing fields" },
		document: structuredArtifact(),
		agentGuideMarkdown: null,
		agentGuideChangeReason: "missing fields rejected",
	})), undefined);
});

test("parseHistoryArtifacts requires an agent guide decision reason", () => {
	assert.equal(parseHistoryArtifacts(JSON.stringify({
		version: "pi-continue-artifacts/v2",
		brief: structuredArtifact(),
		document: structuredArtifact(),
		agentGuideMarkdown: null,
		agentGuideChangeReason: null,
	})), undefined);
});

test("parseSplitPrefix extracts tagged payload", () => {
	assert.equal(parseSplitPrefix("<split-prefix>prefix</split-prefix>"), "prefix");
});
