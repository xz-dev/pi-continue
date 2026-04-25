import type { CompiledPrompt, FileOpsSnapshot, HistoryPromptAssets, HistoryPromptInput, SplitPromptAssets, SplitPromptInput } from "./types.ts";

function renderTag(tag: string, content: string | undefined): string {
	const normalized = content && content.trim().length > 0 ? content.trim() : "(none)";
	return `<${tag}>\n${normalized}\n</${tag}>`;
}

function renderFileOps(fileOps: FileOpsSnapshot): string {
	const reads = fileOps.readFiles.length > 0 ? fileOps.readFiles.join("\n") : "(none)";
	const modified = fileOps.modifiedFiles.length > 0 ? fileOps.modifiedFiles.join("\n") : "(none)";
	return [`<read-files>`, reads, `</read-files>`, ``, `<modified-files>`, modified, `</modified-files>`].join("\n");
}

/** Compile the history-pass prompt from externalized assets plus runtime material. */
export function compileHistoryPrompt(assets: HistoryPromptAssets, input: HistoryPromptInput): CompiledPrompt {
	const sections = [
		renderTag("base-continuation-contract", assets.baseUser.content),
		renderTag("history-task", assets.scenarioUser.content),
		renderTag("project-root", input.projectRoot),
		renderTag("continuation-doc-path", input.continuationDocPath),
		renderTag("existing-continuation-md", input.existingContinuationDoc),
		renderTag("previous-compaction-summary", input.previousSummary),
		renderTag("history-to-summarize", input.historyTranscript),
		renderTag("file-operations", renderFileOps(input.fileOps)),
		renderTag("custom-instructions", input.customInstructions),
	];
	return {
		systemPrompt: assets.system.content.trim(),
		userPrompt: sections.join("\n\n"),
		sources: {
			system: assets.system.sourcePath,
			baseUser: assets.baseUser.sourcePath,
			scenarioUser: assets.scenarioUser.sourcePath,
		},
	};
}

/** Compile the split-prefix pass prompt from externalized assets plus runtime material. */
export function compileSplitPrompt(assets: SplitPromptAssets, input: SplitPromptInput): CompiledPrompt {
	const sections = [
		renderTag("split-task", assets.scenarioUser.content),
		renderTag("project-root", input.projectRoot),
		renderTag("continuation-doc-path", input.continuationDocPath),
		renderTag("split-prefix-history", input.splitPrefixTranscript),
		renderTag("custom-instructions", input.customInstructions),
	];
	return {
		systemPrompt: assets.system.content.trim(),
		userPrompt: sections.join("\n\n"),
		sources: {
			system: assets.system.sourcePath,
			scenarioUser: assets.scenarioUser.sourcePath,
		},
	};
}

/** Render a human-readable prompt preview for the settings and preview commands. */
export function renderPromptPreview(title: string, prompt: CompiledPrompt): string {
	const parts = [
		`# ${title}`,
		``,
		`## Sources`,
		`- System: ${prompt.sources.system}`,
		prompt.sources.baseUser ? `- Base user: ${prompt.sources.baseUser}` : undefined,
		`- Scenario user: ${prompt.sources.scenarioUser}`,
		``,
		`## System Prompt`,
		prompt.systemPrompt,
		``,
		`## User Prompt`,
		prompt.userPrompt,
	].filter((entry): entry is string => entry !== undefined);
	return `${parts.join("\n")}\n`;
}
