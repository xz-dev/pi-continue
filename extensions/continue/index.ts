import { randomUUID } from "node:crypto";
import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { loadHistoryPromptAssets, loadSplitPromptAssets } from "./src/assets.ts";
import { parseHistoryArtifacts, parseSplitPrefix } from "./src/blocks.ts";
import { splitContinueSubcommand, shouldOpenContinuePalette, buildContinuationCommandArgs } from "./src/command-shape.ts";
import { runPreviewCommand, runResetCommand, runSettingsDialog, runStatusCommand } from "./src/commands.ts";
import { getContinueArgumentCompletions } from "./src/completions.ts";
import { normalizeCompactionPreparation, type FileOperations } from "./src/compaction-preparation.ts";
import { composeCompactionSummary } from "./src/compose.ts";
import { loadContinuationConfig } from "./src/config.ts";
import {
	abandonActiveContinuationEvent,
	failPendingDocumentSyncForEvent,
	getActiveContinuationEventId,
	isLatestContinuationEvent,
	markActiveContinuationArtifact,
	planActiveDocumentSync,
	recordDocumentSyncResult,
	sanitizeEventReason,
} from "./src/continuation-event.ts";
import { buildContinuationDetails, parseContinuationDetails } from "./src/details.ts";
import { buildHistoryFallback, buildSplitFallback } from "./src/fallback.ts";
import { runMidRunGuard } from "./src/mid-run-guard.ts";
import { resolveTokenBudget, runPromptPass } from "./src/model.ts";
import { loadPiInternals } from "./src/pi-internals.ts";
import { compileHistoryPrompt, compileSplitPrompt } from "./src/prompt.ts";
import { resolveProjectContext, writeRepoDocument } from "./src/project.ts";
import { showContinuePalette } from "./src/palette.ts";
import type { ContinuePaletteResult } from "./src/palette-actions.ts";
import { createContinuationRuntimeState, runContinuationCommand, type ContinuationRuntimeState } from "./src/runtime.ts";
import type { AgentGuideWriteStatus, DocumentSyncMode, ParsedHistoryArtifacts, PendingDocumentWrite } from "./src/types.ts";

async function runEnabledContinuationCommand(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	runtime: ContinuationRuntimeState,
	args: string | undefined,
	sendContinuation: (prompt: string) => void,
	onContinuationFailed: (eventId: string) => void,
): Promise<void> {
	const projectContext = await resolveProjectContext(pi, ctx.cwd, "CONTINUE.md");
	const config = loadContinuationConfig(projectContext.projectRoot);
	if (!config.enabled) {
		if (ctx.hasUI) ctx.ui.notify("pi-continue is disabled. Re-enable it with /continue settings.", "warning");
		return;
	}
	await runContinuationCommand(ctx, runtime, args, sendContinuation, onContinuationFailed);
}

async function runContinuePaletteResult(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	runtime: ContinuationRuntimeState,
	result: ContinuePaletteResult,
	onContinuationFailed: (eventId: string) => void,
): Promise<void> {
	if (result.kind === "status") {
		await runStatusCommand(pi, ctx, runtime);
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
		onContinuationFailed,
	);
}

function computeFileListsSnapshot(fileOps: FileOperations): {
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

function decideAgentGuideWriteStatus(syncMode: DocumentSyncMode, agentGuideMd: string | undefined): AgentGuideWriteStatus {
	if (syncMode === "off") return "sync-off";
	return agentGuideMd ? "replacement-pending" : "no-replacement";
}

export default function (pi: ExtensionAPI) {
	const pendingDocumentWrites = new Map<string, PendingDocumentWrite>();
	const runtime = createContinuationRuntimeState();

	function cleanupPendingDocumentWrites(eventId: string): void {
		let removed = false;
		for (const [syncId, pending] of pendingDocumentWrites) {
			if (pending.eventId !== eventId) continue;
			pendingDocumentWrites.delete(syncId);
			removed = true;
		}
		if (removed) {
			failPendingDocumentSyncForEvent(runtime, eventId, "Document sync did not complete before continuation failed.");
		}
	}

	pi.registerCommand("continue", {
		description: "Open continuation actions; shortcuts: steer, queue, preview, status, settings, reset",
		getArgumentCompletions: getContinueArgumentCompletions,
		handler: async (args, ctx) => {
			if (shouldOpenContinuePalette(args, ctx.hasUI)) {
				const result = await showContinuePalette(pi, ctx, runtime);
				if (result) await runContinuePaletteResult(pi, ctx, runtime, result, (eventId) => cleanupPendingDocumentWrites(eventId));
				return;
			}
			const subcommand = splitContinueSubcommand(args);
			if (subcommand?.name === "status") {
				await runStatusCommand(pi, ctx, runtime);
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
			await runEnabledContinuationCommand(
				pi,
				ctx,
				runtime,
				args,
				(prompt) => pi.sendUserMessage(prompt),
				(eventId) => cleanupPendingDocumentWrites(eventId),
			);
		},
	});

	pi.on("context", async (event, ctx) => {
		await runMidRunGuard(pi, ctx, runtime, event.messages, (eventId) => cleanupPendingDocumentWrites(eventId));
	});

	pi.on("session_before_compact", async (event, ctx) => {
		const projectContext = await resolveProjectContext(pi, ctx.cwd, "CONTINUE.md");
		const config = loadContinuationConfig(projectContext.projectRoot);
		if (!config.enabled) return undefined;
		const resolvedProjectContext = await resolveProjectContext(pi, ctx.cwd, config.continuationDocPath, config.agentGuidePath);
		const preparation = normalizeCompactionPreparation(event.preparation, event.branchEntries);
		if (preparation.repairedNoOpCut && ctx.hasUI) {
			ctx.ui.notify("Adjusted native compaction checkpoint so continuation has real history.", "warning");
		}
		const fileOpsSnapshot = computeFileListsSnapshot(preparation.fileOps);
		const internals = await loadPiInternals();
		const historyPrompt = compileHistoryPrompt(
			loadHistoryPromptAssets(
				resolvedProjectContext.projectRoot,
				config.promptOverridePolicy,
				preparation.previousSummary ? "update" : "initial",
			),
			{
				scenario: preparation.previousSummary ? "update" : "initial",
				projectRoot: resolvedProjectContext.projectRoot,
				continuationDocPath: resolvedProjectContext.continuationDocPath,
				existingContinuationDoc: resolvedProjectContext.existingContinuationDoc,
				agentGuidePath: resolvedProjectContext.agentGuidePath,
				existingAgentGuide: resolvedProjectContext.existingAgentGuide,
				previousSummary: preparation.previousSummary,
				historyTranscript: internals.serializeConversation(internals.convertToLlm(preparation.messagesToSummarize)),
				customInstructions: event.customInstructions,
				fileOps: fileOpsSnapshot,
			},
		);
		const splitPrompt =
			preparation.isSplitTurn && preparation.turnPrefixMessages.length > 0
				? compileSplitPrompt(
						loadSplitPromptAssets(resolvedProjectContext.projectRoot, config.promptOverridePolicy),
						{
							projectRoot: resolvedProjectContext.projectRoot,
							continuationDocPath: resolvedProjectContext.continuationDocPath,
							splitPrefixTranscript: internals.serializeConversation(internals.convertToLlm(preparation.turnPrefixMessages)),
							customInstructions: event.customInstructions,
						},
				  )
				: undefined;
		const historyBudget = resolveTokenBudget(
			preparation.settings.reserveTokens,
			config.historyMaxTokens,
			"history",
		);
		const splitBudget = resolveTokenBudget(
			preparation.settings.reserveTokens,
			config.splitPrefixMaxTokens,
			"split",
		);
		const historyInputForFallback = {
			scenario: preparation.previousSummary ? "update" as const : "initial" as const,
			projectRoot: resolvedProjectContext.projectRoot,
			continuationDocPath: resolvedProjectContext.continuationDocPath,
			existingContinuationDoc: resolvedProjectContext.existingContinuationDoc,
			agentGuidePath: resolvedProjectContext.agentGuidePath,
			existingAgentGuide: resolvedProjectContext.existingAgentGuide,
			previousSummary: preparation.previousSummary,
			historyTranscript: internals.serializeConversation(internals.convertToLlm(preparation.messagesToSummarize)),
			customInstructions: event.customInstructions,
			fileOps: fileOpsSnapshot,
		};
		const splitInputForFallback = splitPrompt
			? {
				projectRoot: resolvedProjectContext.projectRoot,
				continuationDocPath: resolvedProjectContext.continuationDocPath,
				splitPrefixTranscript: internals.serializeConversation(internals.convertToLlm(preparation.turnPrefixMessages)),
				customInstructions: event.customInstructions,
			}
			: undefined;
		let historyArtifacts: ParsedHistoryArtifacts;
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
			markActiveContinuationArtifact(runtime, "modeled", undefined);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (config.fallbackMode === "abort") {
				markActiveContinuationArtifact(runtime, "aborted", message);
				throw error instanceof Error ? error : new Error(message);
			}
			markActiveContinuationArtifact(runtime, "fallback", message);
			historyArtifacts = buildHistoryFallback(historyInputForFallback, message);
			splitPrefix = splitInputForFallback ? buildSplitFallback(splitInputForFallback, message) : undefined;
		}
		const activeEventId = getActiveContinuationEventId(runtime);
		const documentSyncId = config.continuationDocSyncMode === "always" ? randomUUID() : undefined;
		if (documentSyncId) {
			pendingDocumentWrites.set(documentSyncId, {
				path: resolvedProjectContext.continuationDocPath,
				content: historyArtifacts.continuationMd,
				label: "continuation document",
				target: "continuation-doc",
				eventId: activeEventId,
			});
		}
		const agentGuideWriteStatus = decideAgentGuideWriteStatus(config.agentGuideSyncMode, historyArtifacts.agentGuideMd);
		const agentGuideSyncId = agentGuideWriteStatus === "replacement-pending" ? randomUUID() : undefined;
		if (agentGuideSyncId && historyArtifacts.agentGuideMd) {
			pendingDocumentWrites.set(agentGuideSyncId, {
				path: resolvedProjectContext.agentGuidePath,
				content: historyArtifacts.agentGuideMd,
				label: "agent guide",
				target: "agent-guide",
				eventId: activeEventId,
			});
		}
		planActiveDocumentSync(
			runtime,
			{
				continuationDoc: documentSyncId ? "pending" : "off",
				agentGuide: agentGuideWriteStatus === "replacement-pending"
					? "pending"
					: agentGuideWriteStatus === "no-replacement"
						? "no-replacement"
						: "off",
			},
		);
		const details = buildContinuationDetails(
			preparation.fileOps,
			documentSyncId,
			agentGuideSyncId,
			agentGuideWriteStatus,
			historyArtifacts.agentGuideChangeReason,
		);
		return {
			compaction: {
				summary: composeCompactionSummary(historyArtifacts.continuation, splitPrefix, details, {
					appendCompactionMetadata: config.appendCompactionMetadata,
					appendFileTags: config.appendFileTags,
				}),
				firstKeptEntryId: preparation.firstKeptEntryId,
				tokensBefore: preparation.tokensBefore,
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
			if (pending.eventId && !isLatestContinuationEvent(runtime, pending.eventId)) continue;
			try {
				const result = await writeRepoDocument(pending.path, pending.content);
				recordDocumentSyncResult(runtime, pending.eventId, pending.target, result, undefined);
				if (ctx.hasUI) {
					ctx.ui.notify(
						result === "updated"
							? `Updated ${pending.label}.`
							: `${pending.label} unchanged.`,
						"info",
					);
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				recordDocumentSyncResult(runtime, pending.eventId, pending.target, "failed", message);
				if (ctx.hasUI) ctx.ui.notify(`${pending.label} sync failed: ${sanitizeEventReason(message)}`, "error");
			}
		}
		if (ctx.hasUI && details.agentGuideWriteStatus === "no-replacement" && details.agentGuideChangeReason) {
			ctx.ui.notify("Agent guide unchanged; no full replacement was produced.", "info");
		}
	});

	pi.on("session_shutdown", async () => {
		abandonActiveContinuationEvent(runtime, "Pi session shut down before continuation aftercare settled.");
		pendingDocumentWrites.clear();
		runtime.compactionRunning = false;
		runtime.guardFailureKey = undefined;
	});
}
