import test from "node:test";
import assert from "node:assert/strict";
import { buildHistoryFallback } from "../extensions/continue/src/fallback.ts";

function historyInput() {
	return {
		scenario: "update" as const,
		projectRoot: "/repo",
		continuationDocPath: "/repo/CONTINUE.md",
		existingContinuationDoc: "durable continuation",
		agentGuidePath: "/repo/AGENTS.md",
		existingAgentGuide: "agent guide",
		previousSummary: "previous summary",
		historyTranscript: "recent history",
		customInstructions: "focus validation",
		fileOps: {
			readFiles: ["/repo/read-1.ts", "/repo/read-2.ts", "/repo/read-3.ts"],
			modifiedFiles: ["/repo/mod-1.ts", "/repo/mod-2.ts", "/repo/mod-3.ts", "/repo/mod-4.ts", "/repo/mod-5.ts"],
		},
	};
}

test("buildHistoryFallback emits structured continuation without numeric read caps", () => {
	const fallback = buildHistoryFallback(historyInput(), "model failed");
	assert.match(fallback.continuation, /## Task/);
	assert.match(fallback.continuation, /## Initiative Charter/);
	assert.match(fallback.continuation, /## Definition Of Done/);
	assert.match(fallback.continuation, /## Recency And Supersession/);
	assert.match(fallback.continuation, /Active request recency/);
	assert.match(fallback.continuation, /before treating older plans as active/);
	assert.match(fallback.continuation, /## Current Plan/);
	assert.match(fallback.continuation, /## Decisions and Constraints/);
	assert.match(fallback.continuation, /## Context Map/);
	assert.match(fallback.continuation, /## Working Edge/);
	assert.match(fallback.continuation, /## Risks/);
	assert.match(fallback.continuation, /## Dormant But Important/);
	assert.match(fallback.continuation, /## Retired Or Obsolete/);
	assert.match(fallback.continuation, /## Durable Learnings/);
	assert.match(fallback.continuation, /## Durable Promotions/);
	assert.match(fallback.continuation, /\/repo\/CONTINUE\.md — repo-local continuation document/);
	assert.match(fallback.continuation, /\/repo\/AGENTS\.md — repo operating guide/);
	assert.match(fallback.continuation, /\/repo\/mod-1\.ts — modified during the compacted history/);
	assert.match(fallback.continuation, /\/repo\/mod-5\.ts — modified during the compacted history/);
	assert.doesNotMatch(fallback.continuation, /\/repo\/read-1\.ts/);
	assert.match(fallback.continuation, /Read-path activity is evidence, not a reading inventory/);
	assert.doesNotMatch(fallback.continuation, /Read Before Acting/);
	assert.doesNotMatch(fallback.continuation, /Resume Now/);
	assert.doesNotMatch(fallback.continuation, /Read files:/);
	assert.match(fallback.continuationMd, /## Initiative Charter/);
	assert.match(fallback.continuationMd, /## Definition Of Done/);
	assert.match(fallback.continuationMd, /## Recency And Supersession/);
	assert.match(fallback.continuationMd, /Active request recency/);
	assert.match(fallback.continuationMd, /## Current Plan/);
	assert.match(fallback.continuationMd, /## Decisions and Constraints/);
	assert.match(fallback.continuationMd, /## Context Map/);
	assert.match(fallback.continuationMd, /## Working Edge/);
	assert.match(fallback.continuationMd, /## Risks/);
	assert.match(fallback.continuationMd, /## Dormant But Important/);
	assert.match(fallback.continuationMd, /## Retired Or Obsolete/);
	assert.match(fallback.continuationMd, /## Durable Promotions/);
	assert.match(fallback.continuationMd, /read-path counts are diagnostic only/);
	assert.match(fallback.continuationMd, /## Recent File Activity Counts/);
	assert.match(fallback.continuationMd, /Read path count: 3/);
	assert.match(fallback.continuationMd, /## Agent Guide Updates/);
	assert.match(fallback.continuationMd, /- No modeled AGENTS\.md replacement/);
	assert.doesNotMatch(fallback.continuationMd, /\/repo\/read-1\.ts/);
	assert.doesNotMatch(fallback.continuationMd, /Read files:/);
	assert.equal(fallback.agentGuideMd, undefined);
	assert.equal(fallback.agentGuideChangeReason, "Deterministic fallback does not rewrite AGENTS.md.");
});
