import test from "node:test";
import assert from "node:assert/strict";
import { parseHistoryArtifacts } from "../extensions/continue/src/blocks.ts";

const duplicateSentinel = "DUPLICATE_CONTEXT_CLAIM";
const dormantSentinel = "DORMANT_REVIEW_CONTEXT";
const staleSentinel = "STALE_AWAIT_DIRECTION";
const activeSentinel = "NEW_ACTIVE_REQUEST";

interface ContractValidationResult {
	valid: boolean;
	failures: string[];
}

function countOccurrences(text: string, needle: string): number {
	if (needle.length === 0) return 0;
	return text.split(needle).length - 1;
}

function sectionBody(text: string, heading: string): string {
	const marker = `## ${heading}`;
	const start = text.indexOf(marker);
	if (start < 0) return "";
	const bodyStart = start + marker.length;
	const nextHeading = text.indexOf("\n## ", bodyStart);
	return nextHeading < 0 ? text.slice(bodyStart) : text.slice(bodyStart, nextHeading);
}

function validateRenderedContinuationContract(text: string): ContractValidationResult {
	const failures: string[] = [];
	if (sectionBody(text, "Current Plan").includes(staleSentinel)) {
		failures.push("stale await-direction state survived in Current Plan");
	}
	if (sectionBody(text, "Working Edge").includes(staleSentinel)) {
		failures.push("stale await-direction state survived in Working Edge");
	}
	if (!text.includes(activeSentinel)) {
		failures.push("newest active request was not preserved");
	}
	if (!text.includes(dormantSentinel)) {
		failures.push("dormant but important context was not preserved");
	}
	if (countOccurrences(text, duplicateSentinel) > 1) {
		failures.push("duplicate semantic claim was not collapsed");
	}
	return { valid: failures.length === 0, failures };
}

function structuredArtifact(overrides = {}) {
	return {
		task: `Finish ${activeSentinel}.`,
		initiativeCharter: ["Preserve same-session continuation without replaying transcript history."],
		definitionOfDone: ["The receiving agent has one current working edge and fresh validation state."],
		recencyLedger: [{
			status: "active",
			subject: activeSentinel,
			evidence: "newest user request in the compacted history",
			resolution: "Use the active request instead of older await-direction state.",
		}],
		currentPlan: ["Run the targeted continuation contract checks."],
		progress: [`${duplicateSentinel} was consolidated into one reusable finding.`],
		state: ["Prompt contract uses state ownership and semantic dominance."],
		decisions: ["Do not keep stale and current claims co-active."],
		contextMap: [{ source: "assets/system/history_initial.md", relevance: "compact prompt contract", use: "verify state ownership language" }],
		workingEdge: [`Continue ${activeSentinel} without reviving retired plans.`],
		validation: ["Contract sentinel checks are deterministic test fixtures."],
		risks: ["A prompt edit could reintroduce duplicate semantic claims."],
		dormantContext: [`${dormantSentinel} returns when continuation prompt behavior changes.`],
		retiredContext: [`${staleSentinel} is retired from the active edge.`],
		antiRework: ["Do not replay raw transcript chronology."],
		durableLearnings: ["Bloat is failure; keep one owner for each retained fact."],
		durablePromotions: [{
			status: "none",
			targetSurface: "none",
			proposal: "No durable external-surface update is required by this fixture.",
			evidence: "synthetic test artifact",
			durability: "not applicable",
			risk: "not applicable",
			nextAction: "No action.",
		}],
		agentGuideUpdates: ["No guide write is warranted by this fixture."],
		...overrides,
	};
}

function artifactJson(overrides = {}): string {
	const brief = structuredArtifact(overrides);
	return JSON.stringify({
		version: "pi-continue-artifacts/v3",
		brief,
		document: brief,
		agentGuideMarkdown: null,
		agentGuideChangeReason: "No guide write is warranted by this fixture.",
	});
}

test("contract sentinel validator accepts a consolidated rendered continuation", () => {
	const parsed = parseHistoryArtifacts(artifactJson());
	assert.ok(parsed);
	assert.deepEqual(validateRenderedContinuationContract(parsed.continuation), { valid: true, failures: [] });
});

test("contract sentinel validator catches stale active slots and duplicate semantics", () => {
	const parsed = parseHistoryArtifacts(artifactJson({
		currentPlan: [`Resume ${staleSentinel} as an active plan.`],
		state: [`${duplicateSentinel} was repeated in state.`],
		workingEdge: [`Resume ${staleSentinel} instead of the latest request.`],
	}));
	assert.ok(parsed);
	const result = validateRenderedContinuationContract(parsed.continuation);
	assert.equal(result.valid, false);
	assert.deepEqual(result.failures, [
		"stale await-direction state survived in Current Plan",
		"stale await-direction state survived in Working Edge",
		"duplicate semantic claim was not collapsed",
	]);
});
