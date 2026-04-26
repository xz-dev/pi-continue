import { randomUUID } from "node:crypto";
import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { loadHistoryPromptAssets, loadSplitPromptAssets } from "./src/assets.ts";
import { parseHistoryArtifacts, parseSplitPrefix } from "./src/blocks.ts";
import { splitContinueSubcommand, shouldOpenContinueMenu, buildContinuationCommandArgs } from "./src/command-shape.ts";
import { runPreviewCommand, runResetCommand, runSettingsDialog, runStatusCommand } from "./src/commands.ts";
import { getContinueArgumentCompletions } from "./src/completions.ts";
import { composeCompactionSummary } from "./src/compose.ts";
import { loadContinuationConfig } from "./src/config.ts";
import { buildContinuationDetails, parseContinuationDetails } from "./src/details.ts";
import { buildHistoryFallback, buildSplitFallback } from "./src/fallback.ts";
import { runMidRunGuard } from "./src/mid-run-guard.ts";
import { resolveTokenBudget, runPromptPass } from "./src/model.ts";
import { loadPiInternals } from "./src/pi-internals.ts";
import { compileHistoryPrompt, compileSplitPrompt } from "./src/prompt.ts";
import { resolveProjectContext, writeRepoDocument } from "./src/project.ts";
import { showContinueMenu, type ContinueMenuResult } from "./src/menu.ts";
import { createContinuationRuntimeState, runContinuationCommand, type ContinuationRuntimeState } from "./src/runtime.ts";
import type { PendingDocumentWrite } from "./src/types.ts";

async function runEnabledContinuationCommand(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	runtime: ContinuationRuntimeState,
	args: string | undefined,
	sendContinuation: (prompt: string) => void,
): Promise<void> {
	const projectContext = await resolveProjectContext(pi, ctx.cwd, "CONTINUE.md");
	const config = loadContinuationConfig(projectContext.projectRoot);
	if (!config.enabled) {
		if (ctx.hasUI) ctx.ui.notify("pi-continue is disabled. Re-enable it with /continue settings.", "warning");
		return;
	}
	await runContinuationCommand(ctx, runtime, args, sendContinuation);
}

async function runContinueMenuResult(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	runtime: ContinuationRuntimeState,
	result: ContinueMenuResult,
): Promise<void> {
	if (result.kind === "status") {
		await runStatusCommand(pi, ctx);
		return;
	}
	if (result.kind === "settings") {
		await runSettingsDialog(pi, ctx, result.scope);
		return;
	}
	if (result.kind === "reset") {
		await runResetCommand(pi, ctx, result.scope);
		return;
	}
	if (result.kind === "preview") {
		await runPreviewCommand(pi, ctx, result.instructions);
		return;
	}
	await runEnabledContinuationCommand(
		pi,
		ctx,
		runtime,
		buildContinuationCommandArgs(result.mode, result.instructions),
		(prompt) => pi.sendUserMessage(prompt),
	);
}

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
		description: "Open continuation actions; shortcuts: steer, queue, status, settings, reset, preview",
		getArgumentCompletions: getContinueArgumentCompletions,
		handler: async (args, ctx) => {
			if (shouldOpenContinueMenu(args, ctx.hasUI)) {
				const result = await showContinueMenu(pi, ctx, runtime);
				if (result) await runContinueMenuResult(pi, ctx, runtime, result);
				return;
			}
			const subcommand = splitContinueSubcommand(args);
			if (subcommand?.name === "status") {
				await runStatusCommand(pi, ctx);
				return;
			}
			if (subcommand?.name === "settings") {
				await runSettingsDialog(pi, ctx, subcommand.rest);
				return;
			}
			if (subcommand?.name === "reset") {
				await runResetCommand(pi, ctx, subcommand.rest);
				return;
			}
			if (subcommand?.name === "preview") {
				await runPreviewCommand(pi, ctx, subcommand.rest);
				return;
			}
			await runEnabledContinuationCommand(pi, ctx, runtime, args, (prompt) => pi.sendUserMessage(prompt));
		},
	});

	pi.on("context", async (event, ctx) => {
		await runMidRunGuard(pi, ctx, runtime, event.messages);
	});

	pi.on("session_before_compact", async (event, ctx) => {
		const projectContext = await resolveProjectContext(pi, ctx.cwd, "CONTINUE.md");
		const config = loadContinuationConfig(projectContext.projectRoot);
		if (!config.enabled) return undefined;
		const resolvedProjectContext = await resolveProjectContext(pi, ctx.cwd, config.continuationDocPath, config.agentGuidePath);
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
				agentGuidePath: resolvedProjectContext.agentGuidePath,
				existingAgentGuide: resolvedProjectContext.existingAgentGuide,
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
			agentGuidePath: resolvedProjectContext.agentGuidePath,
			existingAgentGuide: resolvedProjectContext.existingAgentGuide,
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
				throw new Error("History pass omitted required pi-continue JSON artifacts");
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
				path: resolvedProjectContext.continuationDocPath,
				content: historyArtifacts.continuationMd,
				label: "continuation document",
			});
		}
		const agentGuideSyncId = config.agentGuideSyncMode === "always" && historyArtifacts.agentGuideMd ? randomUUID() : undefined;
		if (agentGuideSyncId && historyArtifacts.agentGuideMd) {
			pendingDocumentWrites.set(agentGuideSyncId, {
				path: resolvedProjectContext.agentGuidePath,
				content: historyArtifacts.agentGuideMd,
				label: "agent guide",
			});
		}
		const details = buildContinuationDetails(event.preparation.fileOps, documentSyncId, agentGuideSyncId);
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
		if (!details) return;
		for (const syncId of [details.documentSyncId, details.agentGuideSyncId]) {
			if (!syncId) continue;
			const pending = pendingDocumentWrites.get(syncId);
			pendingDocumentWrites.delete(syncId);
			if (!pending) continue;
			const result = await writeRepoDocument(pending.path, pending.content);
			if (ctx.hasUI) {
				ctx.ui.notify(
					result === "updated"
						? `Updated ${pending.label} at ${pending.path}`
						: `${pending.label} unchanged at ${pending.path}`,
					"info",
				);
			}
		}
	});

	pi.on("session_shutdown", async () => {
		pendingDocumentWrites.clear();
		runtime.compactionRunning = false;
		runtime.guardFailureKey = undefined;
	});
}
