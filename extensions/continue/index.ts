import { randomUUID } from "node:crypto";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { loadHistoryPromptAssets, loadSplitPromptAssets } from "./src/assets.ts";
import { parseHistoryArtifacts, parseSplitPrefix } from "./src/blocks.ts";
import { runPreviewCommand, runResetCommand, runSettingsDialog, runStatusCommand } from "./src/commands.ts";
import { composeCompactionSummary } from "./src/compose.ts";
import { loadContinuationConfig } from "./src/config.ts";
import { buildContinuationDetails, parseContinuationDetails } from "./src/details.ts";
import { buildHistoryFallback, buildSplitFallback } from "./src/fallback.ts";
import { runMidRunGuard } from "./src/mid-run-guard.ts";
import { resolveTokenBudget, runPromptPass } from "./src/model.ts";
import { loadPiInternals } from "./src/pi-internals.ts";
import { compileHistoryPrompt, compileSplitPrompt } from "./src/prompt.ts";
import { resolveProjectContext, writeContinuationDocument } from "./src/project.ts";
import { createContinuationRuntimeState, runContinuationCommand } from "./src/runtime.ts";
import type { PendingDocumentWrite } from "./src/types.ts";

function computeFileListsSnapshot(fileOps: { read: Set<string>; written: Set<string>; edited: Set<string> }): {
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

export default function (pi: ExtensionAPI) {
	const pendingDocumentWrites = new Map<string, PendingDocumentWrite>();
	const runtime = createContinuationRuntimeState();

	pi.registerCommand("continue", {
		description: "Compact and continue this Pi session; use /continue queue to wait for idle",
		handler: async (args, ctx) => {
			const projectContext = await resolveProjectContext(pi, ctx.cwd, "CONTINUE.md");
			const config = loadContinuationConfig(projectContext.projectRoot);
			if (!config.enabled) {
				if (ctx.hasUI) ctx.ui.notify("pi-continue is disabled. Re-enable it in /continue-settings.", "warning");
				return;
			}
			await runContinuationCommand(ctx, runtime, args, (prompt) => pi.sendUserMessage(prompt));
		},
	});

	pi.registerCommand("continue-status", {
		description: "Show continuation config, prompt sources, and compaction threshold",
		handler: async (_args, ctx) => {
			await runStatusCommand(pi, ctx);
		},
	});

	pi.registerCommand("continue-settings", {
		description: "Edit pi-continue settings in the TUI",
		handler: async (args, ctx) => {
			await runSettingsDialog(pi, ctx, args);
		},
	});

	pi.registerCommand("continue-reset", {
		description: "Reset project or global pi-continue config",
		handler: async (args, ctx) => {
			await runResetCommand(pi, ctx, args);
		},
	});

	pi.registerCommand("continue-preview", {
		description: "Preview the continuation prompt payloads that would be used now",
		handler: async (args, ctx) => {
			await runPreviewCommand(pi, ctx, args);
		},
	});

	pi.on("context", async (event, ctx) => {
		await runMidRunGuard(pi, ctx, runtime, event.messages);
	});

	pi.on("session_before_compact", async (event, ctx) => {
		const projectContext = await resolveProjectContext(pi, ctx.cwd, "CONTINUE.md");
		const config = loadContinuationConfig(projectContext.projectRoot);
		if (!config.enabled) return undefined;
		const resolvedProjectContext = await resolveProjectContext(pi, ctx.cwd, config.continuationDocPath);
		const fileOpsSnapshot = computeFileListsSnapshot(event.preparation.fileOps);
		const internals = await loadPiInternals();
		const historyPrompt = compileHistoryPrompt(
			loadHistoryPromptAssets(
				resolvedProjectContext.projectRoot,
				config.promptOverridePolicy,
				event.preparation.previousSummary ? "update" : "initial",
			),
			{
				scenario: event.preparation.previousSummary ? "update" : "initial",
				projectRoot: resolvedProjectContext.projectRoot,
				continuationDocPath: resolvedProjectContext.continuationDocPath,
				existingContinuationDoc: resolvedProjectContext.existingContinuationDoc,
				previousSummary: event.preparation.previousSummary,
				historyTranscript: internals.serializeConversation(internals.convertToLlm(event.preparation.messagesToSummarize)),
				customInstructions: event.customInstructions,
				fileOps: fileOpsSnapshot,
			},
		);
		const splitPrompt =
			event.preparation.isSplitTurn && event.preparation.turnPrefixMessages.length > 0
				? compileSplitPrompt(
						loadSplitPromptAssets(resolvedProjectContext.projectRoot, config.promptOverridePolicy),
						{
							projectRoot: resolvedProjectContext.projectRoot,
							continuationDocPath: resolvedProjectContext.continuationDocPath,
							splitPrefixTranscript: internals.serializeConversation(internals.convertToLlm(event.preparation.turnPrefixMessages)),
							customInstructions: event.customInstructions,
						},
				  )
				: undefined;
		const historyBudget = resolveTokenBudget(
			event.preparation.settings.reserveTokens,
			config.historyMaxTokens,
			"history",
		);
		const splitBudget = resolveTokenBudget(
			event.preparation.settings.reserveTokens,
			config.splitPrefixMaxTokens,
			"split",
		);
		const historyInputForFallback = {
			scenario: event.preparation.previousSummary ? "update" as const : "initial" as const,
			projectRoot: resolvedProjectContext.projectRoot,
			continuationDocPath: resolvedProjectContext.continuationDocPath,
			existingContinuationDoc: resolvedProjectContext.existingContinuationDoc,
			previousSummary: event.preparation.previousSummary,
			historyTranscript: internals.serializeConversation(internals.convertToLlm(event.preparation.messagesToSummarize)),
			customInstructions: event.customInstructions,
			fileOps: fileOpsSnapshot,
		};
		const splitInputForFallback = splitPrompt
			? {
				projectRoot: resolvedProjectContext.projectRoot,
				continuationDocPath: resolvedProjectContext.continuationDocPath,
				splitPrefixTranscript: internals.serializeConversation(internals.convertToLlm(event.preparation.turnPrefixMessages)),
				customInstructions: event.customInstructions,
			}
			: undefined;
		let historyArtifacts;
		let splitPrefix: string | undefined;
		try {
			const historyTask = runPromptPass(pi, ctx, config, historyPrompt, historyBudget, event.signal);
			const splitTask = splitPrompt
				? runPromptPass(pi, ctx, config, splitPrompt, splitBudget, event.signal)
				: Promise.resolve(undefined);
			const [historyOutput, splitOutput] = await Promise.all([historyTask, splitTask]);
			historyArtifacts = parseHistoryArtifacts(historyOutput);
			if (!historyArtifacts) {
				throw new Error("History pass omitted <continuation> or <continuation-md>");
			}
			if (splitPrompt) {
				splitPrefix = splitOutput ? parseSplitPrefix(splitOutput) : undefined;
				if (!splitPrefix) {
					throw new Error("Split-prefix pass omitted <split-prefix>");
				}
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (config.fallbackMode === "abort") {
				throw error instanceof Error ? error : new Error(message);
			}
			historyArtifacts = buildHistoryFallback(historyInputForFallback, message);
			splitPrefix = splitInputForFallback ? buildSplitFallback(splitInputForFallback, message) : undefined;
		}
		const documentSyncId = config.continuationDocSyncMode === "always" ? randomUUID() : undefined;
		if (documentSyncId) {
			pendingDocumentWrites.set(documentSyncId, {
				continuationDocPath: resolvedProjectContext.continuationDocPath,
				content: historyArtifacts.continuationMd,
			});
		}
		const details = buildContinuationDetails(event.preparation.fileOps, documentSyncId);
		return {
			compaction: {
				summary: composeCompactionSummary(historyArtifacts.continuation, splitPrefix, details, {
					appendCompactionMetadata: config.appendCompactionMetadata,
					appendFileTags: config.appendFileTags,
				}),
				firstKeptEntryId: event.preparation.firstKeptEntryId,
				tokensBefore: event.preparation.tokensBefore,
				details,
			},
		};
	});

	pi.on("session_compact", async (event, ctx) => {
		if (!event.fromExtension) return;
		const details = parseContinuationDetails(event.compactionEntry.details);
		if (!details?.documentSyncId) return;
		const pending = pendingDocumentWrites.get(details.documentSyncId);
		pendingDocumentWrites.delete(details.documentSyncId);
		if (!pending) return;
		const result = await writeContinuationDocument(pending.continuationDocPath, pending.content);
		if (ctx.hasUI) {
			ctx.ui.notify(
				result === "updated"
					? `Updated continuation doc at ${pending.continuationDocPath}`
					: `Continuation doc unchanged at ${pending.continuationDocPath}`,
				"info",
			);
		}
	});

	pi.on("session_shutdown", async () => {
		pendingDocumentWrites.clear();
		runtime.compactionRunning = false;
		runtime.guardFailureKey = undefined;
	});
}
