import { renderContinuationDetails } from "./details.ts";
import type { ContinuationCompactionDetails } from "./types.ts";

function renderBlock(tag: string, content: string): string {
	return `<${tag}>\n${content.trim()}\n</${tag}>`;
}

function renderFileListTag(tag: string, values: string[]): string | undefined {
	if (values.length === 0) return undefined;
	return renderBlock(tag, values.join("\n"));
}

/** Render the compaction summary that Pi persists in session history. */
export function composeCompactionSummary(
	continuation: string,
	splitPrefix: string | undefined,
	details: ContinuationCompactionDetails,
	options: { appendCompactionMetadata: boolean; appendFileTags: boolean },
): string {
	const parts = [renderBlock("continuation", continuation)];
	if (splitPrefix && splitPrefix.trim().length > 0) {
		parts.push(renderBlock("split-prefix", splitPrefix));
	}
	if (options.appendCompactionMetadata) {
		parts.push(renderContinuationDetails(details));
	}
	if (options.appendFileTags) {
		const readFiles = renderFileListTag("read-files", details.readFiles);
		const modifiedFiles = renderFileListTag("modified-files", details.modifiedFiles);
		if (readFiles) parts.push(readFiles);
		if (modifiedFiles) parts.push(modifiedFiles);
	}
	return `${parts.join("\n\n")}\n`;
}
