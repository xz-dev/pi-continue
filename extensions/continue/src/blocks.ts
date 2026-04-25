import type { ParsedHistoryArtifacts } from "./types.ts";

function escapeTag(tag: string): string {
	return tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Extract the first XML-style tagged block from model output. */
export function extractTaggedBlock(text: string, tag: string): string | undefined {
	const pattern = new RegExp(`<${escapeTag(tag)}>([\\s\\S]*?)</${escapeTag(tag)}>`, "i");
	const match = text.match(pattern);
	const content = match?.[1]?.trim();
	return content && content.length > 0 ? content : undefined;
}

/** Parse the dual-artifact history response. */
export function parseHistoryArtifacts(text: string): ParsedHistoryArtifacts | undefined {
	const continuation = extractTaggedBlock(text, "continuation");
	const continuationMd = extractTaggedBlock(text, "continuation-md");
	return continuation && continuationMd ? { continuation, continuationMd } : undefined;
}

/** Parse the split-prefix response. */
export function parseSplitPrefix(text: string): string | undefined {
	return extractTaggedBlock(text, "split-prefix");
}
