import test from "node:test";
import assert from "node:assert/strict";
import { parseHistoryArtifacts, parseSplitPrefix } from "../extensions/continue/src/blocks.ts";

function structuredArtifact(overrides = {}) {
	return {
		task: "Finish the approved continuation redesign.",
		initiativeCharter: ["User wants long Pi runs to continue without losing the product story."],
		definitionOfDone: ["Docs, runtime, prompts, and tests agree on the continuation ledger contract."],
		recencyLedger: [{
			status: "superseded",
			subject: "Earlier await-direction state",
			evidence: "A newer user request expanded the task to include adversarial review and release choreography.",
			resolution: "Use the newer request as the active working edge before asking for irreversible release approval.",
		}],
		currentPlan: ["Update tests and docs, then run the gate."],
		progress: ["Structured v2 artifacts replaced fixed read/do headings before this v3 ledger pass."],
		state: ["Runtime contract changed."],
		decisions: ["Single /continue command."],
		contextMap: [{ source: "/repo/README.md", relevance: "operator package guide", use: "verify runtime boundaries" }],
		workingEdge: ["Update tests and docs, then run the gate."],
		validation: ["pnpm test is stale after edits."],
		risks: ["Do not preserve mandatory read/do headings."],
		dormantContext: ["Native Pi compaction changes matter if Pi core adds a mid-turn checkpoint primitive."],
		retiredContext: ["Mandatory read/do headings are obsolete; use contextMap and workingEdge instead."],
		antiRework: ["Do not re-run external research already summarized."],
		durableLearnings: ["Avoid renaming weak constraints instead of redesigning the contract."],
		durablePromotions: [{
			status: "apply",
			targetSurface: "README.md",
			proposal: "Record continuation ledger conservation semantics for operators.",
			evidence: "Prompt contract now preserves initiative spine and durable promotions.",
			durability: "README owns the package-facing contract.",
			risk: "Prompt/docs drift if left only in ignored local notes.",
			nextAction: "Update README.md before delivery.",
		}],
		agentGuideUpdates: ["Capture durable prompt-contract rules if guide sync is enabled."],
		...overrides,
	};
}

const validArtifacts = JSON.stringify({
	version: "pi-continue-artifacts/v3",
	brief: structuredArtifact(),
	document: structuredArtifact({ state: ["Document carries broader durable state."] }),
	agentGuideMarkdown: null,
	agentGuideChangeReason: "no durable guide change",
});

test("parseHistoryArtifacts requires the v3 structured JSON artifact contract", () => {
	assert.equal(parseHistoryArtifacts("<continuation>one</continuation>"), undefined);
	assert.deepEqual(parseHistoryArtifacts(validArtifacts), {
		continuation: [
			"## Task\nFinish the approved continuation redesign.",
			"## Initiative Charter\n- User wants long Pi runs to continue without losing the product story.",
			"## Definition Of Done\n- Docs, runtime, prompts, and tests agree on the continuation ledger contract.",
			"## Recency And Supersession\n- superseded: Earlier await-direction state — evidence: A newer user request expanded the task to include adversarial review and release choreography.; resolution: Use the newer request as the active working edge before asking for irreversible release approval.",
			"## Current Plan\n- Update tests and docs, then run the gate.",
			"## Progress And Milestone Trail\n- Structured v2 artifacts replaced fixed read/do headings before this v3 ledger pass.",
			"## Current State\n- Runtime contract changed.",
			"## Decisions and Constraints\n- Single /continue command.",
			"## Context Map\n- /repo/README.md — operator package guide; use it to verify runtime boundaries.",
			"## Working Edge\n- Update tests and docs, then run the gate.",
			"## Validation\n- pnpm test is stale after edits.",
			"## Risks\n- Do not preserve mandatory read/do headings.",
			"## Dormant But Important\n- Native Pi compaction changes matter if Pi core adds a mid-turn checkpoint primitive.",
			"## Retired Or Obsolete\n- Mandatory read/do headings are obsolete; use contextMap and workingEdge instead.",
			"## Anti-Rework\n- Do not re-run external research already summarized.",
			"## Durable Learnings\n- Avoid renaming weak constraints instead of redesigning the contract.",
			"## Durable Promotions\n- apply: README.md — Record continuation ledger conservation semantics for operators.; evidence: Prompt contract now preserves initiative spine and durable promotions.; durability: README owns the package-facing contract.; risk: Prompt/docs drift if left only in ignored local notes.; next: Update README.md before delivery.",
			"## Agent Guide Updates\n- Capture durable prompt-contract rules if guide sync is enabled.",
		].join("\n\n"),
		continuationMd: [
			"# Continuation",
			"## Task\nFinish the approved continuation redesign.",
			"## Initiative Charter\n- User wants long Pi runs to continue without losing the product story.",
			"## Definition Of Done\n- Docs, runtime, prompts, and tests agree on the continuation ledger contract.",
			"## Recency And Supersession\n- superseded: Earlier await-direction state — evidence: A newer user request expanded the task to include adversarial review and release choreography.; resolution: Use the newer request as the active working edge before asking for irreversible release approval.",
			"## Current Plan\n- Update tests and docs, then run the gate.",
			"## Progress And Milestone Trail\n- Structured v2 artifacts replaced fixed read/do headings before this v3 ledger pass.",
			"## Current State\n- Document carries broader durable state.",
			"## Decisions and Constraints\n- Single /continue command.",
			"## Context Map\n- /repo/README.md — operator package guide; use it to verify runtime boundaries.",
			"## Working Edge\n- Update tests and docs, then run the gate.",
			"## Validation\n- pnpm test is stale after edits.",
			"## Risks\n- Do not preserve mandatory read/do headings.",
			"## Dormant But Important\n- Native Pi compaction changes matter if Pi core adds a mid-turn checkpoint primitive.",
			"## Retired Or Obsolete\n- Mandatory read/do headings are obsolete; use contextMap and workingEdge instead.",
			"## Anti-Rework\n- Do not re-run external research already summarized.",
			"## Durable Learnings\n- Avoid renaming weak constraints instead of redesigning the contract.",
			"## Durable Promotions\n- apply: README.md — Record continuation ledger conservation semantics for operators.; evidence: Prompt contract now preserves initiative spine and durable promotions.; durability: README owns the package-facing contract.; risk: Prompt/docs drift if left only in ignored local notes.; next: Update README.md before delivery.",
			"## Agent Guide Updates\n- Capture durable prompt-contract rules if guide sync is enabled.",
		].join("\n\n"),
		agentGuideMd: undefined,
		agentGuideChangeReason: "no durable guide change",
	});
});

test("parseHistoryArtifacts accepts a full agent guide replacement", () => {
	const parsed = parseHistoryArtifacts(JSON.stringify({
		version: "pi-continue-artifacts/v3",
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
		version: "pi-continue-artifacts/v3",
		brief: { task: "missing fields" },
		document: structuredArtifact(),
		agentGuideMarkdown: null,
		agentGuideChangeReason: "missing fields rejected",
	})), undefined);
});

test("parseHistoryArtifacts rejects invalid durable promotion statuses", () => {
	assert.equal(parseHistoryArtifacts(JSON.stringify({
		version: "pi-continue-artifacts/v3",
		brief: structuredArtifact({ durablePromotions: [{
			status: "later",
			targetSurface: "README.md",
			proposal: "bad status",
			evidence: "test",
			durability: "test",
			risk: "test",
			nextAction: "test",
		}] }),
		document: structuredArtifact(),
		agentGuideMarkdown: null,
		agentGuideChangeReason: "invalid status rejected",
	})), undefined);
});

test("parseHistoryArtifacts rejects invalid recency ledger statuses", () => {
	assert.equal(parseHistoryArtifacts(JSON.stringify({
		version: "pi-continue-artifacts/v3",
		brief: structuredArtifact({ recencyLedger: [{
			status: "newer",
			subject: "bad status",
			evidence: "test",
			resolution: "test",
		}] }),
		document: structuredArtifact(),
		agentGuideMarkdown: null,
		agentGuideChangeReason: "invalid status rejected",
	})), undefined);
});

test("parseHistoryArtifacts requires at least one recency ledger entry", () => {
	assert.equal(parseHistoryArtifacts(JSON.stringify({
		version: "pi-continue-artifacts/v3",
		brief: structuredArtifact({ recencyLedger: [] }),
		document: structuredArtifact(),
		agentGuideMarkdown: null,
		agentGuideChangeReason: "empty recency ledger rejected",
	})), undefined);
});

test("parseHistoryArtifacts requires an agent guide decision reason", () => {
	assert.equal(parseHistoryArtifacts(JSON.stringify({
		version: "pi-continue-artifacts/v3",
		brief: structuredArtifact(),
		document: structuredArtifact(),
		agentGuideMarkdown: null,
		agentGuideChangeReason: null,
	})), undefined);
});

test("parseHistoryArtifacts rejects extra or retired contract keys", () => {
	assert.equal(parseHistoryArtifacts(JSON.stringify({
		version: "pi-continue-artifacts/v3",
		brief: structuredArtifact(),
		document: structuredArtifact(),
		agentGuideMarkdown: null,
		agentGuideChangeReason: "extra top-level key rejected",
		fallbackMode: "deterministic-summary",
	})), undefined);
	assert.equal(parseHistoryArtifacts(JSON.stringify({
		version: "pi-continue-artifacts/v3",
		brief: structuredArtifact({ fallbackMode: "deterministic-summary" }),
		document: structuredArtifact(),
		agentGuideMarkdown: null,
		agentGuideChangeReason: "extra structured key rejected",
	})), undefined);
	assert.equal(parseHistoryArtifacts(JSON.stringify({
		version: "pi-continue-artifacts/v3",
		brief: structuredArtifact({ contextMap: [{ source: "/repo/README.md", relevance: "operator guide", use: "verify docs", priority: "now" }] }),
		document: structuredArtifact(),
		agentGuideMarkdown: null,
		agentGuideChangeReason: "extra context map key rejected",
	})), undefined);
	assert.equal(parseHistoryArtifacts(JSON.stringify({
		version: "pi-continue-artifacts/v3",
		brief: structuredArtifact({ durablePromotions: [{
			status: "apply",
			targetSurface: "README.md",
			proposal: "bad extra key",
			evidence: "test",
			durability: "test",
			risk: "test",
			nextAction: "test",
			compatAlias: "fallbackMode",
		}] }),
		document: structuredArtifact(),
		agentGuideMarkdown: null,
		agentGuideChangeReason: "extra durable promotion key rejected",
	})), undefined);
	assert.equal(parseHistoryArtifacts(JSON.stringify({
		version: "pi-continue-artifacts/v3",
		brief: structuredArtifact({ recencyLedger: [{
			status: "active",
			subject: "new request",
			evidence: "test",
			resolution: "test",
			order: "latest",
		}] }),
		document: structuredArtifact(),
		agentGuideMarkdown: null,
		agentGuideChangeReason: "extra recency key rejected",
	})), undefined);
});

test("parseSplitPrefix accepts raw summary text", () => {
	assert.equal(parseSplitPrefix("prefix"), "prefix");
	assert.equal(parseSplitPrefix("\n\tprefix\n"), "prefix");
});

test("parseSplitPrefix rejects wrapper tags and Markdown fences", () => {
	assert.equal(parseSplitPrefix("<split-prefix>prefix</split-prefix>"), undefined);
	assert.equal(parseSplitPrefix("<split-prefix></split-prefix>"), undefined);
	assert.equal(parseSplitPrefix("<split-prefix>prefix"), undefined);
	assert.equal(parseSplitPrefix("prefix</split-prefix>"), undefined);
	assert.equal(parseSplitPrefix("```md\nprefix\n```"), undefined);
	assert.equal(parseSplitPrefix("~~~md\nprefix\n~~~"), undefined);
});
