import type { FileOpsSnapshot, HistoryPromptInput, ParsedHistoryArtifacts, SplitPromptInput } from "./types.ts";

function clip(value: string | undefined, limit: number): string {
	const trimmed = value?.replace(/\s+/g, " ").trim() ?? "";
	if (trimmed.length === 0) return "(none)";
	return trimmed.length <= limit ? trimmed : `${trimmed.slice(0, limit - 1)}…`;
}

function renderStringSection(title: string, values: string[]): string | undefined {
	if (values.length === 0) return undefined;
	return [`## ${title}`, ...values.map((value) => `- ${value}`)].join("\n");
}

function renderContextMap(input: HistoryPromptInput): string {
	const entries = [
		`- ${input.continuationDocPath} — repo-local continuation document; use it if the compaction summary is missing stable task state.`,
		`- ${input.agentGuidePath} — repo operating guide; use it before changing durable agent rules or judging AGENTS.md candidate updates.`,
	];
	for (const file of input.fileOps.modifiedFiles) {
		entries.push(`- ${file} — modified during the compacted history; inspect before editing or validating to avoid overwriting current work.`);
	}
	return [`## Context Map`, ...entries].join("\n");
}

function renderWorkingEdge(input: HistoryPromptInput): string {
	return renderStringSection("Working Edge", [
		`Continue from the kept live suffix after compaction; do not restart completed discovery.`,
		input.customInstructions
			? `Apply custom compaction focus: ${clip(input.customInstructions, 220)}.`
			: `Verify current dirty state and the active user request before editing.`,
	]) ?? "";
}

function renderFileActivityCounts(fileOps: FileOpsSnapshot): string {
	return [
		`- Read path count: ${fileOps.readFiles.length}`,
		`- Modified path count: ${fileOps.modifiedFiles.length}`,
	].join("\n");
}

function renderAgentGuideCandidate(input: HistoryPromptInput): string {
	return [
		`- No modeled AGENTS.md replacement was produced because deterministic fallback handled this compaction.`,
		`- If durable user preferences, command corrections, or operational rules still matter after resumption, update ${input.agentGuidePath} explicitly through normal repository edits after inspection.`,
	].join("\n");
}

/** Deterministic fallback when model output is unavailable or malformed. */
export function buildHistoryFallback(input: HistoryPromptInput, reason: string): ParsedHistoryArtifacts {
	const continuation = [
		`## Task`,
		`Continue the active user task in the same Pi session after fallback continuation compaction.`,
		``,
		`## Current State`,
		`- Fallback summary reason: ${reason}.`,
		`- Project root: ${input.projectRoot}.`,
		``,
		`## Decisions and Constraints`,
		`- Deterministic fallback did not infer new decisions; preserve explicit user instructions, prior compaction context, and repo guide rules until verified.`,
		``,
		renderContextMap(input),
		``,
		renderWorkingEdge(input),
		``,
		`## Validation`,
		`- No new validation result was synthesized.`,
		``,
		`## Risks`,
		`- Modeled continuation synthesis failed; fallback may omit nuanced decisions, blockers, or validation state that require live inspection.`,
		``,
		`## Anti-Rework`,
		`- Do not replay completed discovery solely because modeled curation failed.`,
		``,
		`## Durable Learnings`,
		`- Read-path activity is evidence, not a reading inventory; fallback lists modified paths for safety and reports read-path counts only.`,
		``,
		`## Agent Guide Updates`,
		renderAgentGuideCandidate(input),
	]
		.join("\n");
	const continuationMd = [
		`# Continuation`,
		``,
		`## Task`,
		`Continue the active user task from the latest Pi compaction without replaying completed discovery.`,
		``,
		`## Current State`,
		`- Deterministic fallback replaced modeled continuation document synthesis during compaction.`,
		`- Reason: ${reason}.`,
		`- Project root: ${input.projectRoot}.`,
		``,
		`## Decisions and Constraints`,
		`- Deterministic fallback did not infer new decisions; preserve explicit user instructions, prior compaction context, and repo guide rules until verified.`,
		``,
		renderContextMap(input),
		``,
		renderWorkingEdge(input),
		``,
		`## Validation`,
		`- No validation result was invented by fallback synthesis. Verify the live working tree and task-specific gates before claiming completion.`,
		``,
		`## Risks`,
		`- Modeled continuation synthesis failed; inspect live state before high-impact edits, guide writes, or completion claims.`,
		``,
		`## Anti-Rework`,
		`- Treat file activity as evidence, not a reading inventory; read-path counts are diagnostic only.`,
		``,
		`## Durable Learnings`,
		input.customInstructions ? `- Honor custom compaction focus: ${clip(input.customInstructions, 260)}.` : undefined,
		`- Promote durable user preferences, command corrections, or reusable operating rules to the agent guide only through explicit guide updates.`,
		``,
		`## Agent Guide Updates`,
		renderAgentGuideCandidate(input),
		``,
		`## Previous Compaction Summary Excerpt`,
		clip(input.previousSummary, 1000),
		``,
		`## Existing Continuation Document Excerpt`,
		clip(input.existingContinuationDoc, 1000),
		``,
		`## Existing Agent Guide Excerpt`,
		clip(input.existingAgentGuide, 1000),
		``,
		`## Recent History Excerpt`,
		clip(input.historyTranscript, 1400),
		``,
		`## Recent File Activity Counts`,
		renderFileActivityCounts(input.fileOps),
	]
		.filter((entry): entry is string => entry !== undefined)
		.join("\n");
	return {
		continuation,
		continuationMd,
		agentGuideMd: undefined,
		agentGuideChangeReason: "Deterministic fallback does not rewrite AGENTS.md.",
	};
}

/** Deterministic fallback for split-turn prefix context. */
export function buildSplitFallback(input: SplitPromptInput, reason: string): string {
	return [
		`Original request and early prefix details require manual review of the kept suffix plus ${input.continuationDocPath}.`,
		`Fallback split-prefix reason: ${reason}.`,
		`Prefix excerpt: ${clip(input.splitPrefixTranscript, 500)}.`,
	]
		.join("\n")
		.trim();
}
