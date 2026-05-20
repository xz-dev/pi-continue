import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { resolveTokenBudget, resolveSummarizerModel } from "./model-settings.ts";
import { readEffectivePiCompactionSettings } from "./pi-settings.ts";
import type {
	ContinuationConfig,
	ContinuationLatestEvent,
	ContinuationResumeOutcome,
	ContinuationSyncStatus,
	PreviewPayload,
	PromptPassTelemetry,
} from "./types.ts";

function describeModel(config: ContinuationConfig, ctx: ExtensionCommandContext): string {
	const resolved = resolveSummarizerModel(ctx, config);
	if (!resolved) return `unresolved (${config.summarizerModel})`;
	return `${resolved.provider}/${resolved.id}`;
}

function renderSharedCompactionThreshold(ctx: ExtensionCommandContext, reserveTokens: number): string {
	const contextWindow = ctx.model?.contextWindow;
	if (!contextWindow || !Number.isFinite(contextWindow) || contextWindow <= reserveTokens) return "unavailable";
	return `${(contextWindow - reserveTokens).toLocaleString()} tokens`;
}

function formatTimestamp(value: number | undefined): string {
	if (value === undefined) return "unavailable";
	return new Date(value).toISOString();
}

function sourceLabel(event: ContinuationLatestEvent): string {
	if (event.source === "mid-run-guard") return "automatic continuation";
	if (event.source === "command-queue") return "queued /continue";
	return "/continue steer";
}

function resumeOutcome(event: ContinuationLatestEvent): ContinuationResumeOutcome {
	return event.resume ?? { status: "not-requested" };
}

function resumeLabel(event: ContinuationLatestEvent): string {
	const resume = resumeOutcome(event);
	if (resume.status === "not-requested") return "not requested";
	if (resume.status === "pending") return "resume request sent; waiting for assistant turn";
	if (resume.status === "running") return "resumed assistant turn is running";
	if (resume.status === "completed") return `completed${resume.stopReason ? ` (${resume.stopReason})` : ""}`;
	if (resume.status === "aborted") return "aborted";
	return "failed";
}

function statusLabel(event: ContinuationLatestEvent): string {
	const resume = resumeOutcome(event);
	if (event.status === "running") {
		if (resume.status === "pending") return "handoff saved; resume is pending";
		if (resume.status === "running") return "resume turn is running";
		return "handoff is being saved";
	}
	if (event.status === "failed") {
		if (resume.status === "aborted") return "resume was aborted";
		if (resume.status === "failed") return "resume needs attention";
		return "continuation needs attention";
	}
	if (event.status === "blocked") return "blocked a repeated unsafe retry";
	if (event.documentSync.continuationDoc === "failed" || event.documentSync.agentGuide === "failed") return "completed, but document sync needs attention";
	if (event.promptStatus === "sent" && resume.status !== "completed") return "handoff saved; resume outcome unavailable";
	return "completed successfully";
}

function renderTrigger(event: ContinuationLatestEvent): string {
	if (!event.trigger) return "manual request";
	return [
		`${event.trigger.estimatedTokens.toLocaleString()}/${event.trigger.contextWindow.toLocaleString()} estimated tokens`,
		`threshold ${event.trigger.thresholdTokens.toLocaleString()}`,
		`reserve ${event.trigger.reserveTokens.toLocaleString()}`,
	].join(", ");
}

function renderSafeBoundary(event: ContinuationLatestEvent): string {
	if (event.source === "mid-run-guard") return "completed assistant/tool-result batch before the next model request";
	if (event.source === "command-queue") return "waited until Pi was idle before saving the handoff";
	return "requested by user; the current assistant turn stops first when needed";
}

function ledgerLabel(event: ContinuationLatestEvent): string {
	if (event.artifactStatus === "modeled") return "Continuation Ledger ready";
	if (event.artifactStatus === "aborted") return "Continuation Ledger was not created";
	return "waiting for Continuation Ledger";
}

function compactionProofLabel(event: ContinuationLatestEvent): string {
	if (event.compactionProof.status === "verified") return `verified package-owned pi-continue/v4 compaction${event.compactionProof.compactionEntryId ? ` (${event.compactionProof.compactionEntryId})` : ""}`;
	if (event.compactionProof.status === "failed") return "missing or invalid package-owned compaction proof";
	return "waiting for package-owned pi-continue/v4 compaction proof";
}

function syncLabel(status: ContinuationSyncStatus): string {
	if (status === "off") return "off";
	if (status === "pending") return "pending";
	if (status === "updated") return "updated";
	if (status === "unchanged") return "unchanged";
	if (status === "failed") return "failed";
	return "no replacement";
}

function hasNoDocumentWrite(event: ContinuationLatestEvent): boolean {
	const continuationNoWrite = event.documentSync.continuationDoc === "off";
	const agentGuideNoWrite = event.documentSync.agentGuide === "off" || event.documentSync.agentGuide === "no-replacement";
	return continuationNoWrite && agentGuideNoWrite;
}

function actionLine(event: ContinuationLatestEvent): string {
	const resume = resumeOutcome(event);
	if (event.status === "running" && resume.status === "pending") return "Wait for the resumed assistant turn to start.";
	if (event.status === "running" && resume.status === "running") return "Wait for the resumed assistant turn to finish its first assistant response.";
	if (event.status === "running" && event.compactionProof.status === "pending" && event.artifactStatus === "modeled") return "Wait for Pi to report the saved package-owned handoff proof.";
	if (event.status === "running") return "Wait; pi-continue is saving the handoff now.";
	if (event.status === "blocked") return "No new handoff was started; fix the last failure before retrying.";
	if (resume.status === "failed" || resume.status === "aborted") return "Review the resume outcome, correct the cause if needed, then continue from live state.";
	if (event.status === "failed") return "Review the failure, correct the cause, then retry when Pi is idle.";
	if (event.documentSync.continuationDoc === "failed" || event.documentSync.agentGuide === "failed") return "Continuation completed; review document permissions or paths before relying on repo-document sync.";
	if (event.documentSync.continuationDoc === "pending" || event.documentSync.agentGuide === "pending") return "Handoff saved; wait for document sync to settle.";
	return "No action needed.";
}

function formatCost(value: number | undefined): string {
	if (value === undefined) return "unavailable";
	if (value === 0) return "$0";
	return `$${value.toFixed(6)}`;
}

function renderPassTelemetry(label: string, telemetry: PromptPassTelemetry | undefined): string | undefined {
	if (!telemetry) return undefined;
	const routed = telemetry.responseModel ? `; routed ${telemetry.responseModel}` : "";
	const http = telemetry.httpStatus !== undefined ? `; HTTP ${telemetry.httpStatus}` : "";
	return `- ${label}: requested ${telemetry.requestedModel}${routed}; ${telemetry.usage.totalTokens.toLocaleString()} tokens; ${formatCost(telemetry.usage.costTotal)}${http}.`;
}

function renderSynthesisSummary(event: ContinuationLatestEvent): string[] {
	const synthesis = event.synthesis;
	const lines = synthesis
		? [
			`- Synthesis total: ${synthesis.totalTokens?.toLocaleString() ?? "unavailable"} tokens; ${formatCost(synthesis.totalCost)}.`,
			renderPassTelemetry("History pass", synthesis.history),
			renderPassTelemetry("Split-prefix pass", synthesis.split),
		]
		: [`- Synthesis: no model-run details recorded for this continuation.`];
	if (event.synthesisFailure) {
		lines.push(`- Synthesis failure: ${event.synthesisFailure.stage}; ${event.synthesisFailure.reason}`);
	}
	return lines.filter((line): line is string => line !== undefined);
}

function renderEventSummary(event: ContinuationLatestEvent | undefined): string[] {
	if (!event) {
		return [
			`## Continuation`,
			`- Current state: ready.`,
			`- Last handoff: none in this session.`,
			`- Action: No action needed.`,
		];
	}
	const resume = resumeOutcome(event);
	const currentState = event.status === "running"
		? resume.status === "pending" || resume.status === "running"
			? "resume is still settling"
			: "handoff is being saved"
		: "ready";
	const lines = [
		`## Continuation`,
		`- Current state: ${currentState}.`,
		`- Last handoff: ${statusLabel(event)}.`,
		`- Source: ${sourceLabel(event)}.`,
		`- Safe boundary: ${renderSafeBoundary(event)}.`,
		`- Trigger: ${renderTrigger(event)}.`,
		`- Ledger: ${ledgerLabel(event)}.`,
		`- Saved handoff proof: ${compactionProofLabel(event)}.`,
		...renderSynthesisSummary(event),
		`- Resume request: ${event.promptStatus === "sent" ? "sent" : event.promptStatus === "pending" ? "pending" : event.promptStatus === "failed" ? "not sent" : "not requested"}.`,
		`- Resume outcome: ${resumeLabel(event)}.`,
		resume.requestedModel ? `- Resume model: requested ${resume.requestedModel}${resume.responseModel ? `; routed ${resume.responseModel}` : ""}.` : undefined,
		`- Document sync: continuation doc ${syncLabel(event.documentSync.continuationDoc)}; agent guide ${syncLabel(event.documentSync.agentGuide)}.`,
		hasNoDocumentWrite(event) ? `- Document writes: none performed.` : undefined,
		`- Action: ${actionLine(event)}`,
		``,
		`## Diagnostics`,
		`- Run id: ${event.id}`,
		`- Started: ${formatTimestamp(event.startedAt)}`,
		`- Settled: ${formatTimestamp(event.completedAt)}`,
		resume.startedAt ? `- Resume started: ${formatTimestamp(resume.startedAt)}` : undefined,
		resume.completedAt ? `- Resume settled: ${formatTimestamp(resume.completedAt)}` : undefined,
		event.failureReason ? `- Needs attention: ${event.failureReason}` : undefined,
		resume.failureReason && resume.failureReason !== event.failureReason ? `- Resume needs attention: ${resume.failureReason}` : undefined,
	];
	return lines.filter((line): line is string => line !== undefined);
}

/** Render effective config, prompt provenance, document-write behavior, and latest continuation status. */
export function renderStatus(
	ctx: ExtensionCommandContext,
	config: ContinuationConfig,
	projectRoot: string,
	continuationDocPath: string,
	agentGuidePath: string,
	payload: PreviewPayload | undefined,
	latestEvent: ContinuationLatestEvent | undefined,
): string {
	const piCompactionSettings = readEffectivePiCompactionSettings(projectRoot);
	const modelDescription = describeModel(config, ctx);
	const historyBudget = resolveTokenBudget(piCompactionSettings.reserveTokens, config.historyMaxTokens, "history");
	const lines = [
		`# Continuation Status`,
		``,
		...renderEventSummary(latestEvent),
		``,
		`## Effective Settings`,
		`- Enabled: ${config.enabled ? "yes" : "no"}`,
		`- Handoff model: ${config.summarizerModel} -> ${modelDescription}`,
		`- Reasoning: ${config.reasoning}`,
		`- History budget: ${config.historyMaxTokens ?? `Pi default (${historyBudget})`}`,
		`- Continuation file: ${continuationDocPath}`,
		`- Save continuation file: ${config.continuationDocSyncMode}`,
		`- Agent guide: ${agentGuidePath}`,
		`- Agent guide updates: ${config.agentGuideSyncMode}`,
		`- Agent guide writes: ${config.agentGuideSyncMode === "always" ? "full replacement only" : "off"}`,
		`- Automatic mid-run continuation: ${config.midRunGuardEnabled ? "yes" : "no"}`,
		`- Append compaction metadata: ${config.appendCompactionMetadata ? "yes" : "no"}`,
		`- Append read file tags: ${config.appendReadFileTags ? "yes" : "no"}`,
		`- Append modified file tags: ${config.appendModifiedFileTags ? "yes" : "no"}`,
		`- Prompt override policy: ${config.promptOverridePolicy}`,
		`- Show brief after compaction: ${config.showAfterCompact ? "yes" : "no"}`,
		``,
		`## Pi Core Compaction`,
		`- Enabled: ${piCompactionSettings.enabled ? "yes" : "no"}`,
		`- Reserve tokens: ${piCompactionSettings.reserveTokens}`,
		`- Trigger: ${renderSharedCompactionThreshold(ctx, piCompactionSettings.reserveTokens)}`,
		`- Keep recent: ${piCompactionSettings.keepRecentTokens}`,
		``,
		`## What Can Change`,
		`- Continuation file sync writes the rendered continuation document when set to always.`,
		`- Agent guide sync writes only full agentGuideUpdate.content replacements to the configured guide; candidates do not modify files.`,
		`- Brief entries guide the receiver; they are not proof that files were written.`,
		`- Ledger display is temporary UI only; it does not append a session message.`,
		``,
		`## Project`,
		`- Root: ${projectRoot}`,
		payload ? `- Scenario: ${payload.scenario}` : `- Scenario: unavailable`,
		payload ? `- Split now: ${payload.isSplitTurn ? "yes" : "no"}` : `- Split now: unavailable`,
		payload ? `- History prompt system: ${payload.history.sources.system}` : undefined,
		payload ? `- History prompt base: ${payload.history.sources.baseUser}` : undefined,
		payload ? `- History prompt scenario: ${payload.history.sources.scenarioUser}` : undefined,
	].filter((line): line is string => line !== undefined);
	return `${lines.join("\n")}\n`;
}
