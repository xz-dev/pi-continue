import { randomUUID } from "node:crypto";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { loadHistoryPromptAssets } from "./src/assets.ts";
import { parseHistoryArtifacts } from "./src/blocks.ts";
import { splitContinueSubcommand, shouldOpenContinuePalette } from "./src/command-shape.ts";
import { runContinuePaletteResult, runEnabledContinuationCommand } from "./src/command-runner.ts";
import { runLedgerCommand, runPreviewCommand, runResetCommand, runSettingsDialog, runStatusCommand } from "./src/commands.ts";
import { getContinueArgumentCompletions } from "./src/completions.ts";
import { normalizeCompactionPreparation, snapshotFileOperations } from "./src/compaction-preparation.ts";
import { composeCompactionSummary } from "./src/compose.ts";
import { DEFAULT_CONTINUE_CONFIG, loadContinuationConfig } from "./src/config.ts";
import {
	abandonActiveContinuationEvent,
	failPendingDocumentSyncForEvent,
	getActiveContinuationEventId,
	isLatestContinuationEvent,
	markActiveContinuationArtifact,
	planActiveDocumentSync,
	recordActiveSynthesisFailure,
	recordActiveSynthesisTelemetry,
	recordDocumentSyncResult,
} from "./src/continuation-event.ts";
import { buildContinuationDetails, buildContinuationSynthesisTelemetry, parseContinuationDetails } from "./src/details.ts";
import { SYNTHESIS_ABORT_MESSAGE } from "./src/synthesis-error.ts";
import { buildLedgerSnapshot, showContinuationLedgerOverlaySoon } from "./src/ledger-viewer.ts";
import { runMidRunGuard } from "./src/mid-run-guard.ts";
import { resolveTokenBudget, runPromptPass } from "./src/model.ts";
import { loadPiInternals } from "./src/pi-internals.ts";
import { compileHistoryPrompt } from "./src/prompt.ts";
import { resolveProjectContext, writeRepoDocument } from "./src/project.ts";
import { isContinuationPromptUserMessage } from "./src/prompt-dispatch.ts";
import { showContinuePalette } from "./src/palette.ts";
import {
	CONTINUATION_PROMPT,
	CONTINUE_STATUS_KEY,
	acceptContinuationCompactionProof,
	armDeferredResumeStartTimeout,
	clearResumeStartTimeout,
	createContinuationRuntimeState,
	failContinuationCompactionProof,
	failRunningAwaitingContinuationResume,
	markAwaitingContinuationResumeStarted,
	settleAwaitingContinuationResumeFromAssistant,
	type ContinuationRuntimeState,
} from "./src/runtime.ts";
import {
	INVALID_COMPACTION_PROOF_FAILURE,
	NATIVE_COMPACTION_FALLBACK_FAILURE,
	STALE_COMPACTION_PROOF_FAILURE,
	clearPendingResumeDispatch,
} from "./src/resume-proof.ts";
import type { AgentGuideWriteStatus, ContinuationSynthesisFailureStage, ContinuationSynthesisTelemetry, DocumentSyncMode, ParsedHistoryArtifacts, PendingDocumentWrite } from "./src/types.ts";
import {
	clearWorkingVisuals,
	settleWorkingVisuals,
} from "./src/working-ui.ts";

function decideAgentGuideWriteStatus(syncMode: DocumentSyncMode, agentGuideMd: string | undefined): AgentGuideWriteStatus {
	if (syncMode === "off") return "sync-off";
	return agentGuideMd ? "replacement-pending" : "no-replacement";
}

function isAssistantMessage(message: unknown): message is AssistantMessage {
	return typeof message === "object" && message !== null && "role" in message && message.role === "assistant";
}

const DOCUMENT_SYNC_FAILURE = "Document sync failed; check the configured path and permissions.";
const PENDING_DOCUMENT_SYNC_FAILURE = "Document sync did not complete before continuation failed.";

class SynthesisStageError extends Error {
	readonly stage: ContinuationSynthesisFailureStage;

	constructor(stage: ContinuationSynthesisFailureStage, reason: string) {
		super(reason);
		this.stage = stage;
	}
}

function normalizeSynthesisFailure(error: unknown): { stage: ContinuationSynthesisFailureStage; reason: string } {
	if (error instanceof SynthesisStageError) return { stage: error.stage, reason: error.message };
	return { stage: "unknown", reason: "Continuation synthesis failed before a usable artifact was created." };
}

function setRuntimeStatus(ctx: ExtensionContext, value: string | undefined): void {
	if (!ctx.hasUI) return;
	ctx.ui.setStatus(CONTINUE_STATUS_KEY, value);
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
			failPendingDocumentSyncForEvent(runtime, eventId, PENDING_DOCUMENT_SYNC_FAILURE);
		}
	}

	pi.registerCommand("continue", {
		description: "Save a same-session handoff, resume this run, or inspect continuation settings.",
		getArgumentCompletions: getContinueArgumentCompletions,
		handler: async (args, ctx) => {
			if (shouldOpenContinuePalette(args, ctx.hasUI)) {
				const palette = await showContinuePalette(pi, ctx, runtime);
				if (palette.supported) {
					if (palette.result) await runContinuePaletteResult(pi, ctx, runtime, palette.result, (eventId) => cleanupPendingDocumentWrites(eventId));
					return;
				}
			}
			const subcommand = splitContinueSubcommand(args);
			if (subcommand?.name === "status") {
				await runStatusCommand(pi, ctx, runtime);
				return;
			}
			if (subcommand?.name === "ledger") {
				await runLedgerCommand(ctx, runtime);
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
				(eventId) => cleanupPendingDocumentWrites(eventId),
			);
		},
	});

	pi.on("before_agent_start", async (event, ctx) => {
		if (event.prompt !== CONTINUATION_PROMPT) return;
		const eventId = markAwaitingContinuationResumeStarted(runtime);
		if (!eventId) return;
		setRuntimeStatus(ctx, "pi-continue resume running");
	});

	pi.on("message_start", async (event, ctx) => {
		if (isContinuationPromptUserMessage(event.message, CONTINUATION_PROMPT)) {
			const eventId = markAwaitingContinuationResumeStarted(runtime);
			if (eventId) setRuntimeStatus(ctx, "pi-continue resume running");
			return;
		}
		if (!isAssistantMessage(event.message)) return;
		const eventId = runtime.awaitingResumeEventId;
		if (!eventId || runtime.latestEvent?.id !== eventId || runtime.latestEvent.resume.status !== "running") return;
		setRuntimeStatus(ctx, "pi-continue resume running");
	});

	pi.on("agent_end", async (_event, ctx) => {
		const settlement = failRunningAwaitingContinuationResume(runtime, "Continuation resume did not produce an assistant response.");
		if (settlement) {
			settleWorkingVisuals(ctx, runtime, settlement.eventId);
			setRuntimeStatus(ctx, "pi-continue resume failed");
			return;
		}
		armDeferredResumeStartTimeout(ctx, runtime);
	});

	pi.on("message_end", async (event, ctx) => {
		if (!isAssistantMessage(event.message)) return;
		const settlement = settleAwaitingContinuationResumeFromAssistant(runtime, event.message);
		if (!settlement) return;
		const statusText = settlement.status === "completed"
			? undefined
			: settlement.status === "aborted"
				? "pi-continue resume aborted"
				: "pi-continue resume failed";
		settleWorkingVisuals(ctx, runtime, settlement.eventId);
		setRuntimeStatus(ctx, statusText);
	});

	pi.on("context", async (event, ctx) => {
		await runMidRunGuard(pi, ctx, runtime, event.messages, (eventId) => cleanupPendingDocumentWrites(eventId));
	});

	pi.on("session_before_compact", async (event, ctx) => {
		const projectContext = await resolveProjectContext(pi, ctx.cwd, "CONTINUE.md");
		const config = loadContinuationConfig(projectContext.projectRoot);
		if (!config.enabled) return undefined;
		if (getActiveContinuationEventId(runtime) === undefined) return undefined;
		const resolvedProjectContext = await resolveProjectContext(pi, ctx.cwd, config.continuationDocPath, config.agentGuidePath);
		const preparation = normalizeCompactionPreparation(event.preparation, event.branchEntries);
		if (preparation.repairedNoOpCut && ctx.hasUI) {
			ctx.ui.notify("pi-continue moved the handoff to a safer checkpoint before resuming.", "warning");
		}
		const fileOpsSnapshot = snapshotFileOperations(preparation.fileOps);
		const internals = await loadPiInternals();
		// Strip pi-continue's own receiver prompt so the synthesizer never mistakes
		// our resume wrapper ("Continue from the same-session pi-continue/v4 handoff…")
		// for user content. Otherwise the synthesizer can promote our wrapper sentences
		// as `forbid` or `task` entries.
		const stripPiContinueInjection = <T>(messages: T[]): T[] =>
			messages.filter((message) => !isContinuationPromptUserMessage(message, CONTINUATION_PROMPT));
		const messagesToSummarize = stripPiContinueInjection(preparation.messagesToSummarize);
		const turnPrefixMessages = stripPiContinueInjection(preparation.turnPrefixMessages);
		const turnPrefixTranscript = preparation.isSplitTurn && turnPrefixMessages.length > 0
			? internals.serializeConversation(internals.convertToLlm(turnPrefixMessages))
			: undefined;
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
				historyTranscript: internals.serializeConversation(internals.convertToLlm(messagesToSummarize)),
				turnPrefixTranscript,
				customInstructions: event.customInstructions,
				fileOps: fileOpsSnapshot,
			},
		);
		const historyBudget = resolveTokenBudget(
			preparation.settings.reserveTokens,
			config.historyMaxTokens,
			"history",
		);
		let historyArtifacts: ParsedHistoryArtifacts;
		let synthesis: ContinuationSynthesisTelemetry | undefined;
		try {
			let historyOutput: Awaited<ReturnType<typeof runPromptPass>> | undefined;
			try {
				historyOutput = await runPromptPass(pi, ctx, config, historyPrompt, historyBudget, event.signal);
			} catch {
				synthesis = buildContinuationSynthesisTelemetry(undefined, undefined);
				recordActiveSynthesisTelemetry(runtime, synthesis);
				throw new SynthesisStageError("history-model", "History summarizer pass failed.");
			}
			synthesis = buildContinuationSynthesisTelemetry(historyOutput, undefined);
			recordActiveSynthesisTelemetry(runtime, synthesis);
			if (!historyOutput) throw new SynthesisStageError("history-model", "History summarizer pass omitted a response.");
			const parsedHistoryArtifacts = parseHistoryArtifacts(historyOutput.text);
			if (!parsedHistoryArtifacts) {
				throw new SynthesisStageError("history-artifact", "History pass omitted required pi-continue JSON artifacts.");
			}
			historyArtifacts = parsedHistoryArtifacts;
			markActiveContinuationArtifact(runtime, "modeled", undefined);
		} catch (error) {
			recordActiveSynthesisFailure(runtime, normalizeSynthesisFailure(error));
			markActiveContinuationArtifact(runtime, "aborted", SYNTHESIS_ABORT_MESSAGE);
			return { cancel: true };
		}
		const activeEventId = getActiveContinuationEventId(runtime);
		const documentSyncId = config.continuationDocSyncMode === "always" ? randomUUID() : undefined;
		if (documentSyncId) {
			pendingDocumentWrites.set(documentSyncId, {
				path: resolvedProjectContext.continuationDocPath,
				content: historyArtifacts.briefMarkdown,
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
		const continuationEventId = getActiveContinuationEventId(runtime);
		const details = buildContinuationDetails(
			preparation.fileOps,
			documentSyncId,
			agentGuideSyncId,
			agentGuideWriteStatus,
			historyArtifacts.agentGuideChangeReason,
			synthesis,
			continuationEventId,
		);
		return {
			compaction: {
				summary: composeCompactionSummary(historyArtifacts.briefMarkdown, details, {
					appendCompactionMetadata: config.appendCompactionMetadata,
					appendReadFileTags: config.appendReadFileTags,
					appendModifiedFileTags: config.appendModifiedFileTags,
				}),
				firstKeptEntryId: preparation.firstKeptEntryId,
				tokensBefore: preparation.tokensBefore,
				details,
			},
		};
	});

	pi.on("session_compact", async (event, ctx) => {
		const activeEventId = getActiveContinuationEventId(runtime);
		if (activeEventId && !event.fromExtension) {
			failContinuationCompactionProof(ctx, runtime, activeEventId, NATIVE_COMPACTION_FALLBACK_FAILURE);
			return;
		}
		if (!event.fromExtension) return;
		const details = parseContinuationDetails(event.compactionEntry.details);
		if (activeEventId && !details) {
			failContinuationCompactionProof(ctx, runtime, activeEventId, INVALID_COMPACTION_PROOF_FAILURE);
			return;
		}
		if (!details) return;
		if (activeEventId && details.continuationEventId !== activeEventId) {
			failContinuationCompactionProof(ctx, runtime, activeEventId, STALE_COMPACTION_PROOF_FAILURE);
			return;
		}
		const ledgerOwnerId = details.continuationEventId;
		const canUpdateLedger = ledgerOwnerId ? isLatestContinuationEvent(runtime, ledgerOwnerId) : getActiveContinuationEventId(runtime) === undefined;
		const ledger = canUpdateLedger
			? buildLedgerSnapshot(event.compactionEntry.summary, ledgerOwnerId, event.compactionEntry.id)
			: undefined;
		if (ledger) {
			runtime.latestLedger = ledger;
			const projectContext = await resolveProjectContext(pi, ctx.cwd, DEFAULT_CONTINUE_CONFIG.continuationDocPath);
			const config = loadContinuationConfig(projectContext.projectRoot);
			if (config.enabled && config.showAfterCompact) {
				showContinuationLedgerOverlaySoon(ctx, ledger, (reason) => {
					if (ctx.hasUI) ctx.ui.notify(`Could not open Continuation Ledger: ${reason}`, "error");
				});
			}
		}
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
							: `${pending.label} was already up to date.`,
						"info",
					);
				}
			} catch {
				recordDocumentSyncResult(runtime, pending.eventId, pending.target, "failed", DOCUMENT_SYNC_FAILURE);
				if (ctx.hasUI) ctx.ui.notify(`Could not update ${pending.label}: ${DOCUMENT_SYNC_FAILURE}`, "error");
			}
		}
		if (ctx.hasUI && details.agentGuideWriteStatus === "no-replacement" && details.agentGuideChangeReason) {
			ctx.ui.notify("Agent guide unchanged; no full replacement was produced.", "info");
		}
		if (activeEventId) acceptContinuationCompactionProof(ctx, runtime, activeEventId, event.compactionEntry.id);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		abandonActiveContinuationEvent(runtime, "Pi session shut down before continuation finished settling.");
		pendingDocumentWrites.clear();
		clearWorkingVisuals(ctx, runtime);
		runtime.compactionRunning = false;
		runtime.guardFailureKey = undefined;
		clearResumeStartTimeout(runtime);
		clearPendingResumeDispatch(runtime);
		runtime.awaitingResumeEventId = undefined;
	});
}
