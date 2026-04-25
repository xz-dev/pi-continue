import type { FileOpsSnapshot, HistoryPromptInput, ParsedHistoryArtifacts, SplitPromptInput } from "./types.ts";

function clip(value: string | undefined, limit: number): string {
	const trimmed = value?.replace(/\s+/g, " ").trim() ?? "";
	if (trimmed.length === 0) return "(none)";
	return trimmed.length <= limit ? trimmed : `${trimmed.slice(0, limit - 1)}…`;
}

const MUST_READ_LIMIT = 5;

function renderMustRead(input: HistoryPromptInput): string {
	const entries = [
		`- ${input.continuationDocPath} — durable repo-local continuation document; read first to recover stable task state when modeled curation failed.`,
	];
	for (const file of input.fileOps.modifiedFiles) {
		if (entries.length >= MUST_READ_LIMIT) break;
		entries.push(`- ${file} — modified during the compacted history; inspect before editing or validating to avoid overwriting current work.`);
	}
	return entries.join("\n");
}

function renderStartFromHere(input: HistoryPromptInput): string {
	return [
		`- Continue from the kept live suffix after compaction; do not restart completed discovery.`,
		input.customInstructions
			? `- Apply custom compaction focus: ${clip(input.customInstructions, 220)}.`
			: `- Verify current dirty state and the active user request before editing.`,
	].join("\n");
}

function renderFileActivityCounts(fileOps: FileOpsSnapshot): string {
	return [
		`- Read path count: ${fileOps.readFiles.length}`,
		`- Modified path count: ${fileOps.modifiedFiles.length}`,
	].join("\n");
}

/** Deterministic fallback when model output is unavailable or malformed. */
export function buildHistoryFallback(input: HistoryPromptInput, reason: string): ParsedHistoryArtifacts {
	const continuation = [
		`## Must Read`,
		renderMustRead(input),
		``,
		`## Start From Here`,
		renderStartFromHere(input),
		``,
		`## Fallback Context`,
		`Fallback summary reason: ${reason}.`,
		`Modeled curation was unavailable; Must Read is limited to the document path plus safety-critical modified paths, not read-path activity.`,
		`Project root: ${input.projectRoot}.`,
		`Previous compaction summary excerpt: ${clip(input.previousSummary, 220)}.`,
		`Existing CONTINUE.md excerpt: ${clip(input.existingContinuationDoc, 220)}.`,
		`History excerpt: ${clip(input.historyTranscript, 260)}.`,
	]
		.join("\n");
	const continuationMd = [
		`# CONTINUE`,
		``,
		`## Status`,
		`Deterministic fallback replaced modeled continuation document synthesis during compaction.`,
		`Reason: ${reason}.`,
		``,
		`## Project Root`,
		input.projectRoot,
		``,
		`## Must Read`,
		renderMustRead(input),
		``,
		`## Start From Here`,
		renderStartFromHere(input),
		``,
		`## Durable Guidance`,
		`Read the next compaction continuation note plus the kept live suffix before acting.`,
		`Treat file activity as evidence, not a reading inventory; read-path counts are diagnostic only.`,
		input.customInstructions ? `Honor custom compaction focus: ${clip(input.customInstructions, 260)}.` : undefined,
		``,
		`## Previous Compaction Summary Excerpt`,
		clip(input.previousSummary, 1000),
		``,
		`## Existing CONTINUE.md Excerpt`,
		clip(input.existingContinuationDoc, 1000),
		``,
		`## Recent History Excerpt`,
		clip(input.historyTranscript, 1400),
		``,
		`## Recent File Activity Counts`,
		renderFileActivityCounts(input.fileOps),
	]
		.filter((entry): entry is string => entry !== undefined)
		.join("\n");
	return { continuation, continuationMd };
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
