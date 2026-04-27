import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { resolveTokenBudget, resolveSummarizerModel } from "./model-settings.ts";
import { readEffectivePiCompactionSettings } from "./pi-settings.ts";
import type { ContinuationConfig, PreviewPayload } from "./types.ts";

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

/** Render effective config, prompt provenance, and document-write semantics. */
export function renderStatus(
	ctx: ExtensionCommandContext,
	config: ContinuationConfig,
	projectRoot: string,
	continuationDocPath: string,
	agentGuidePath: string,
	payload: PreviewPayload | undefined,
): string {
	const piCompactionSettings = readEffectivePiCompactionSettings(projectRoot);
	const modelDescription = describeModel(config, ctx);
	const historyBudget = resolveTokenBudget(piCompactionSettings.reserveTokens, config.historyMaxTokens, "history");
	const splitBudget = resolveTokenBudget(piCompactionSettings.reserveTokens, config.splitPrefixMaxTokens, "split");
	const lines = [
		`# Continuation Status`,
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
