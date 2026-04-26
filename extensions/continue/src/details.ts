import type { ContinuationCompactionDetails } from "./types.ts";

interface FileOperations {
	read: Set<string>;
	written: Set<string>;
	edited: Set<string>;
}

interface ContinuationSummaryMetadata {
	kind: "pi-continue/v2";
	readFileCount: number;
	modifiedFileCount: number;
	documentSyncId?: string;
	agentGuideSyncId?: string;
}

function computeFileLists(fileOps: FileOperations): { readFiles: string[]; modifiedFiles: string[] } {
	const modified = new Set<string>([...fileOps.written, ...fileOps.edited]);
	const read = new Set<string>(fileOps.read);
	for (const file of modified) read.delete(file);
	return {
		readFiles: [...read].sort((left, right) => left.localeCompare(right)),
		modifiedFiles: [...modified].sort((left, right) => left.localeCompare(right)),
	};
}

const CONTINUATION_DETAILS_KIND = "pi-continue/v2";

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

/** Parse the package-owned compaction-entry details payload used by session_compact. */
export function parseContinuationDetails(value: unknown): ContinuationCompactionDetails | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const record = value as Record<string, unknown>;
	if (record.kind !== CONTINUATION_DETAILS_KIND) return undefined;
	if (!isStringArray(record.readFiles) || !isStringArray(record.modifiedFiles)) return undefined;
	const documentSyncId = typeof record.documentSyncId === "string" ? record.documentSyncId : undefined;
	const agentGuideSyncId = typeof record.agentGuideSyncId === "string" ? record.agentGuideSyncId : undefined;
	return {
		kind: CONTINUATION_DETAILS_KIND,
		readFiles: record.readFiles,
		modifiedFiles: record.modifiedFiles,
		documentSyncId,
		agentGuideSyncId,
	};
}

/** Build current-compaction details without inheriting cumulative path lists from older summaries. */
export function buildContinuationDetails(
	fileOps: FileOperations,
	documentSyncId: string | undefined,
	agentGuideSyncId: string | undefined,
): ContinuationCompactionDetails {
	const { readFiles, modifiedFiles } = computeFileLists(fileOps);
	return {
		kind: CONTINUATION_DETAILS_KIND,
		readFiles,
		modifiedFiles,
		documentSyncId,
		agentGuideSyncId,
	};
}

function buildSummaryMetadata(details: ContinuationCompactionDetails): ContinuationSummaryMetadata {
	const metadata: ContinuationSummaryMetadata = {
		kind: details.kind,
		readFileCount: details.readFiles.length,
		modifiedFileCount: details.modifiedFiles.length,
	};
	if (details.documentSyncId) metadata.documentSyncId = details.documentSyncId;
	if (details.agentGuideSyncId) metadata.agentGuideSyncId = details.agentGuideSyncId;
	return metadata;
}

/** Serialize compact, non-path metadata for the visible compaction summary appendix. */
export function renderContinuationDetails(details: ContinuationCompactionDetails): string {
	return `<continuation-compaction-details>\n${JSON.stringify(buildSummaryMetadata(details), null, 2)}\n</continuation-compaction-details>`;
}
