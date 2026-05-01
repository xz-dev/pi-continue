import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { resolveTokenBudget, resolveSummarizerModel } from "./model-settings.ts";
import { readEffectivePiCompactionSettings } from "./pi-settings.ts";
import type {
	ContinuationConfig,
	ContinuationLatestEvent,
	ContinuationResumeOutcome,
	ContinuationSynthesisTelemetry,
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
	const thresholdTokens = contextWindow - reserveTokens;
	const thresholdPercent = (thresholdTokens / contextWindow) * 100;
	return `${thresholdTokens.toLocaleString()} tokens (${thresholdPercent.toFixed(1)}% of ${contextWindow.toLocaleString()})`;
}

function formatTimestamp(value: number | undefined): string {
	if (value === undefined) return "unavailable";
	return new Date(value).toISOString();
}

function sourceLabel(event: ContinuationLatestEvent): string {
	if (event.source === "mid-run-guard") return "automatic mid-run guard";
	if (event.source === "command-queue") return "queued /continue";
	return "/continue steer";
}

function resumeOutcome(event: ContinuationLatestEvent): ContinuationResumeOutcome {
	return event.resume ?? { status: "not-requested" };
}

function resumeLabel(event: ContinuationLatestEvent): string {
	const resume = resumeOutcome(event);
	if (resume.status === "not-requested") return "not requested";
	if (resume.status === "pending") return "prompt sent; waiting for resumed assistant turn";
	if (resume.status === "running") return "resumed assistant turn is running";
	if (resume.status === "completed") return `completed${resume.stopReason ? ` (${resume.stopReason})` : ""}`;
	if (resume.status === "aborted") return "aborted";
	return "failed";
}

function statusLabel(event: ContinuationLatestEvent): string {
	const resume = resumeOutcome(event);
	if (event.status === "running") {
		if (resume.status === "pending") return "compaction completed; resume is pending";
		if (resume.status === "running") return "resume turn is running";
		return "continuation is running";
	}
	if (event.status === "failed") {
		if (resume.status === "aborted") return "resume was aborted";
		if (resume.status === "failed") return "resume needs attention";
		return "continuation needs attention";
	}
	if (event.status === "blocked") return "guard blocked a repeated unsafe retry";
	if (event.artifactStatus === "fallback") return "completed with fallback summary";
	if (event.documentSync.continuationDoc === "failed" || event.documentSync.agentGuide === "failed") return "completed, but document sync needs attention";
	if (event.promptStatus === "sent" && resume.status !== "completed") return "compaction completed; resume outcome unavailable";
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
	if (event.source === "mid-run-guard") return "completed assistant/tool-result batch before the next provider request";
	if (event.source === "command-queue") return "queued until Pi was idle, then compacted";
	return "user-requested native compaction; active work is aborted before compaction when needed";
}

function artifactLabel(event: ContinuationLatestEvent): string {
	if (event.artifactStatus === "modeled") return "Continuation Ledger parsed successfully";
	if (event.artifactStatus === "fallback") return "deterministic fallback summary was used";
	if (event.artifactStatus === "aborted") return "modeled synthesis aborted before a usable artifact";
	return "waiting for continuation artifact";
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
	if (event.status === "running") return "Wait; Pi is compacting now.";
	if (event.status === "blocked") return "No new compaction was started; fix the failed compaction cause before retrying.";
	if (resume.status === "failed" || resume.status === "aborted") return "Review the resume outcome, correct the cause if needed, then continue from live state.";
	if (event.status === "failed") return "Review the failure, correct the cause, then retry only when the session is stable.";
	if (event.documentSync.continuationDoc === "failed" || event.documentSync.agentGuide === "failed") return "Continuation completed; review document permissions or paths before relying on repo-document sync.";
	if (event.artifactStatus === "fallback") return "Continue carefully from live state; fallback may miss nuanced decisions or validation freshness.";
	if (event.documentSync.continuationDoc === "pending" || event.documentSync.agentGuide === "pending") return "Compaction completed; wait for document sync to settle.";
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

function renderSynthesisSummary(synthesis: ContinuationSynthesisTelemetry | undefined): string[] {
	if (!synthesis) return [`- Synthesis: no modeled telemetry recorded.`];
	return [
		`- Synthesis total: ${synthesis.totalTokens?.toLocaleString() ?? "unavailable"} tokens; ${formatCost(synthesis.totalCost)}.`,
		renderPassTelemetry("History pass", synthesis.history),
		renderPassTelemetry("Split-prefix pass", synthesis.split),
	].filter((line): line is string => line !== undefined);
}

function renderEventSummary(event: ContinuationLatestEvent | undefined): string[] {
	if (!event) {
		return [
			`## Continuation Aftercare`,
			`- Current state: no continuation is running.`,
			`- Last continuation: none recorded since this extension loaded.`,
			`- Action: No action needed.`,
		];
	}
	const resume = resumeOutcome(event);
	const currentState = event.status === "running"
		? resume.status === "pending" || resume.status === "running"
			? "continuation resume is still settling"
			: "continuation compaction is running"
		: "no continuation is running";
	const lines = [
		`## Continuation Aftercare`,
		`- Current state: ${currentState}.`,
		`- Last continuation: ${statusLabel(event)}.`,
		`- Source: ${sourceLabel(event)}.`,
		`- Checkpoint: ${renderSafeBoundary(event)}.`,
		`- Trigger: ${renderTrigger(event)}.`,
		`- Artifact: ${artifactLabel(event)}.`,
		...renderSynthesisSummary(event.synthesis),
		`- Continuation prompt: ${event.promptStatus === "sent" ? "sent" : event.promptStatus === "pending" ? "pending" : event.promptStatus === "failed" ? "not sent" : "not requested"}.`,
		`- Resume outcome: ${resumeLabel(event)}.`,
		resume.requestedModel ? `- Resume model: requested ${resume.requestedModel}${resume.responseModel ? `; routed ${resume.responseModel}` : ""}.` : undefined,
		`- Document sync: continuation doc ${syncLabel(event.documentSync.continuationDoc)}; agent guide ${syncLabel(event.documentSync.agentGuide)}.`,
		hasNoDocumentWrite(event) ? `- Document writes: none performed.` : undefined,
		`- Action: ${actionLine(event)}`,
		``,
		`## Latest Event Details`,
		`- Event id: ${event.id}`,
		`- Started: ${formatTimestamp(event.startedAt)}`,
		`- Settled: ${formatTimestamp(event.completedAt)}`,
		resume.startedAt ? `- Resume started: ${formatTimestamp(resume.startedAt)}` : undefined,
		resume.completedAt ? `- Resume settled: ${formatTimestamp(resume.completedAt)}` : undefined,
		event.failureReason ? `- Attention: ${event.failureReason}` : undefined,
		resume.failureReason && resume.failureReason !== event.failureReason ? `- Resume attention: ${resume.failureReason}` : undefined,
	];
	return lines.filter((line): line is string => line !== undefined);
}

/** Render effective config, prompt provenance, document-write semantics, and latest continuation aftercare. */
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
	const splitBudget = resolveTokenBudget(piCompactionSettings.reserveTokens, config.splitPrefixMaxTokens, "split");
	const lines = [
		`# Continuation Status`,
		``,
		...renderEventSummary(latestEvent),
		``,
		`## Effective Config`,
		`- Enabled: ${config.enabled ? "yes" : "no"}`,
		`- Model: ${config.summarizerModel} -> ${modelDescription}`,
		`- Reasoning: ${config.reasoning}`,
		`- History tokens: ${config.historyMaxTokens ?? `pi-default (${historyBudget})`}`,
		`- Split tokens: ${config.splitPrefixMaxTokens ?? `pi-default (${splitBudget})`}`,
		`- Continuation doc: ${continuationDocPath}`,
		`- Continuation sync: ${config.continuationDocSyncMode}`,
		`- Agent guide: ${agentGuidePath}`,
		`- Agent guide sync: ${config.agentGuideSyncMode}`,
		`- Agent guide writes: ${config.agentGuideSyncMode === "always" ? "full replacement only" : "off"}`,
		`- Mid-run guard: ${config.midRunGuardEnabled ? "yes" : "no"}`,
		`- Append compaction metadata: ${config.appendCompactionMetadata ? "yes" : "no"}`,
		`- Append file tags: ${config.appendFileTags ? "yes" : "no"}`,
		`- Prompt override policy: ${config.promptOverridePolicy}`,
		`- Fallback mode: ${config.fallbackMode}`,
		`- Ledger display: ${config.ledgerDisplayMode}`,
		``,
		`## Pi Core Compaction`,
		`- Enabled: ${piCompactionSettings.enabled ? "yes" : "no"}`,
		`- Reserve tokens: ${piCompactionSettings.reserveTokens}`,
		`- Trigger: ${renderSharedCompactionThreshold(ctx, piCompactionSettings.reserveTokens)}`,
		`- Keep recent: ${piCompactionSettings.keepRecentTokens}`,
		``,
		`## Write Semantics`,
		`- Continuation sync writes modeled document artifacts when set to always.`,
		`- Agent guide sync writes only full agentGuideMarkdown replacements; candidates do not modify AGENTS.md.`,
		`- Durable promotions are normal-work proposals, not compaction write proof.`,
		`- Ledger display is transient UI only; it does not append a session message.`,
		``,
		`## Project`,
		`- Root: ${projectRoot}`,
		payload ? `- Scenario: ${payload.scenario}` : `- Scenario: unavailable`,
		payload ? `- Split now: ${payload.isSplitTurn ? "yes" : "no"}` : `- Split now: unavailable`,
		payload ? `- History system: ${payload.history.sources.system}` : undefined,
		payload ? `- History base: ${payload.history.sources.baseUser}` : undefined,
		payload ? `- History scenario: ${payload.history.sources.scenarioUser}` : undefined,
		payload?.split ? `- Split system: ${payload.split.sources.system}` : undefined,
		payload?.split ? `- Split scenario: ${payload.split.sources.scenarioUser}` : undefined,
	].filter((line): line is string => line !== undefined);
	return `${lines.join("\n")}\n`;
}
