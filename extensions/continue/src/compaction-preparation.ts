import type { PiCompactionSettings } from "./types.ts";

/** File-operation sets extracted from compacted assistant tool calls. */
export interface FileOperations {
	read: Set<string>;
	written: Set<string>;
	edited: Set<string>;
}

/** Pi compaction preparation fields consumed by the continuation synthesizer. */
export interface ContinuationCompactionPreparation {
	firstKeptEntryId: string;
	messagesToSummarize: unknown[];
	turnPrefixMessages: unknown[];
	isSplitTurn: boolean;
	tokensBefore: number;
	previousSummary?: string;
	fileOps: FileOperations;
	settings: PiCompactionSettings;
}

/** Continuation preparation after package-level safety repair decisions. */
export interface NormalizedCompactionPreparation extends ContinuationCompactionPreparation {
	repairedNoOpCut: boolean;
}

interface EntryRecord {
	type: string;
	id: string;
	message?: unknown;
	customType?: unknown;
	content?: unknown;
	display?: unknown;
	details?: unknown;
	timestamp?: unknown;
	summary?: unknown;
	fromId?: unknown;
	firstKeptEntryId?: unknown;
}

interface MessageRecord {
	role: string;
	content?: unknown;
}

interface ToolCallBlock {
	type: "toolCall";
	name: string;
	arguments: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function asEntry(value: unknown): EntryRecord | undefined {
	if (!isRecord(value)) return undefined;
	return typeof value.type === "string" && typeof value.id === "string" ? { ...value, type: value.type, id: value.id } : undefined;
}

function asMessage(value: unknown): MessageRecord | undefined {
	if (!isRecord(value)) return undefined;
	return typeof value.role === "string" ? { ...value, role: value.role } : undefined;
}

function asToolCallBlock(value: unknown): ToolCallBlock | undefined {
	if (!isRecord(value)) return undefined;
	if (value.type !== "toolCall" || typeof value.name !== "string" || !isRecord(value.arguments)) return undefined;
	return {
		type: "toolCall",
		name: value.name,
		arguments: value.arguments,
	};
}

function messageRole(entry: EntryRecord | undefined): string | undefined {
	return asMessage(entry?.message)?.role;
}

function createFileOps(): FileOperations {
	return {
		read: new Set<string>(),
		written: new Set<string>(),
		edited: new Set<string>(),
	};
}

export function snapshotFileOperations(fileOps: FileOperations): {
	readFiles: string[];
	modifiedFiles: string[];
} {
	const modified = new Set<string>([...fileOps.written, ...fileOps.edited]);
	const reads = new Set<string>(fileOps.read);
	for (const file of modified) reads.delete(file);
	return {
		readFiles: [...reads].sort((left, right) => left.localeCompare(right)),
		modifiedFiles: [...modified].sort((left, right) => left.localeCompare(right)),
	};
}

function messageFromEntryForCompaction(entry: EntryRecord): unknown | undefined {
	if (entry.type === "message") return entry.message;
	if (entry.type === "custom_message") {
		return {
			role: "custom",
			customType: entry.customType,
			content: entry.content,
			display: entry.display,
			details: entry.details,
			timestamp: entry.timestamp,
		};
	}
	if (entry.type === "branch_summary" && typeof entry.summary === "string" && typeof entry.fromId === "string") {
		return {
			role: "branchSummary",
			summary: entry.summary,
			fromId: entry.fromId,
			timestamp: entry.timestamp,
		};
	}
	return undefined;
}

function messagesFromEntryRange(entries: EntryRecord[], startIndex: number, endIndex: number): unknown[] {
	const messages: unknown[] = [];
	for (let index = startIndex; index < endIndex; index++) {
		const message = messageFromEntryForCompaction(entries[index]);
		if (message) messages.push(message);
	}
	return messages;
}

function extractFileOpsFromMessage(message: unknown, fileOps: FileOperations): void {
	const record = asMessage(message);
	if (!record || record.role !== "assistant" || !Array.isArray(record.content)) return;
	for (const block of record.content) {
		const toolCall = asToolCallBlock(block);
		const path = typeof toolCall?.arguments.path === "string" ? toolCall.arguments.path : undefined;
		if (!toolCall || !path) continue;
		if (toolCall.name === "read") fileOps.read.add(path);
		if (toolCall.name === "write") fileOps.written.add(path);
		if (toolCall.name === "edit") fileOps.edited.add(path);
	}
}

function extractFileOps(messages: unknown[]): FileOperations {
	const fileOps = createFileOps();
	for (const message of messages) extractFileOpsFromMessage(message, fileOps);
	return fileOps;
}

function findCompletedToolResultSuffixAssistantIndex(entries: EntryRecord[]): number | undefined {
	let index = entries.length - 1;
	if (messageRole(entries[index]) !== "toolResult") return undefined;
	while (index >= 0 && messageRole(entries[index]) === "toolResult") index--;
	return messageRole(entries[index]) === "assistant" ? index : undefined;
}

function findPreviousCompactionIndex(entries: EntryRecord[], beforeIndex: number): number | undefined {
	for (let index = beforeIndex - 1; index >= 0; index--) {
		if (entries[index].type === "compaction") return index;
	}
	return undefined;
}

function findBoundaryStart(entries: EntryRecord[], beforeIndex: number): number {
	const compactionIndex = findPreviousCompactionIndex(entries, beforeIndex);
	if (compactionIndex === undefined) return 0;
	const firstKeptEntryId = entries[compactionIndex].firstKeptEntryId;
	if (typeof firstKeptEntryId !== "string") return compactionIndex + 1;
	const firstKeptIndex = entries.findIndex((entry) => entry.id === firstKeptEntryId);
	return firstKeptIndex >= 0 ? firstKeptIndex : compactionIndex + 1;
}

function isTurnStart(entry: EntryRecord | undefined): boolean {
	if (!entry) return false;
	if (entry.type === "branch_summary" || entry.type === "custom_message") return true;
	const role = messageRole(entry);
	return role === "user" || role === "bashExecution";
}

function findTurnStartIndex(entries: EntryRecord[], entryIndex: number, startIndex: number): number | undefined {
	for (let index = entryIndex; index >= startIndex; index--) {
		if (isTurnStart(entries[index])) return index;
	}
	return undefined;
}

function shouldRepairNoOpPreparation(
	preparation: ContinuationCompactionPreparation,
	entries: EntryRecord[],
	assistantIndex: number,
): boolean {
	if (preparation.messagesToSummarize.length > 0 || preparation.turnPrefixMessages.length > 0) return false;
	const firstKeptIndex = entries.findIndex((entry) => entry.id === preparation.firstKeptEntryId);
	return firstKeptIndex >= 0 && firstKeptIndex < assistantIndex;
}

/**
 * Repair Pi preparations that would append a summary while keeping the whole branch.
 *
 * Pi can currently choose the branch root when the recent tool-result suffix alone crosses
 * `keepRecentTokens`. That produces empty `messagesToSummarize`, no file operations, and a
 * compaction that does not reduce context. For a completed assistant/tool-result batch, the safe
 * replacement cut is the assistant message that owns the suffix, with the earlier same-turn prefix
 * summarized separately.
 */
export function normalizeCompactionPreparation(
	preparation: ContinuationCompactionPreparation,
	branchEntries: unknown[],
): NormalizedCompactionPreparation {
	const entries = branchEntries.map(asEntry).filter((entry): entry is EntryRecord => entry !== undefined);
	const assistantIndex = findCompletedToolResultSuffixAssistantIndex(entries);
	if (assistantIndex === undefined || !shouldRepairNoOpPreparation(preparation, entries, assistantIndex)) {
		return { ...preparation, repairedNoOpCut: false };
	}
	const boundaryStart = findBoundaryStart(entries, assistantIndex);
	if (boundaryStart >= assistantIndex) return { ...preparation, repairedNoOpCut: false };
	const turnStartIndex = findTurnStartIndex(entries, assistantIndex, boundaryStart);
	const isSplitTurn = turnStartIndex !== undefined && turnStartIndex < assistantIndex;
	const messagesToSummarize = messagesFromEntryRange(
		entries,
		boundaryStart,
		isSplitTurn ? turnStartIndex : assistantIndex,
	);
	const turnPrefixMessages = isSplitTurn ? messagesFromEntryRange(entries, turnStartIndex, assistantIndex) : [];
	if (messagesToSummarize.length === 0 && turnPrefixMessages.length === 0) {
		return { ...preparation, repairedNoOpCut: false };
	}
	const summarizedMessages = [...messagesToSummarize, ...turnPrefixMessages];
	return {
		...preparation,
		firstKeptEntryId: entries[assistantIndex].id,
		messagesToSummarize,
		turnPrefixMessages,
		isSplitTurn,
		fileOps: extractFileOps(summarizedMessages),
		repairedNoOpCut: true,
	};
}
