import type { Api, Model } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ContinuationConfig } from "./types.ts";

/** Resolve the effective summarizer model from config or the current session model. */
export function resolveSummarizerModel(
	ctx: ExtensionContext,
	config: ContinuationConfig,
): Model<Api> | undefined {
	if (config.summarizerModel === "inherit") return ctx.model;
	const slashIndex = config.summarizerModel.indexOf("/");
	if (slashIndex <= 0 || slashIndex === config.summarizerModel.length - 1) return undefined;
	const provider = config.summarizerModel.slice(0, slashIndex);
	const modelId = config.summarizerModel.slice(slashIndex + 1);
	return ctx.modelRegistry.find(provider, modelId);
}

/** Match Pi default branch token formulas when no package override is configured. */
export function resolveTokenBudget(
	reserveTokens: number,
	override: number | null,
	kind: "history" | "split",
): number {
	if (override !== null) return override;
	return kind === "history" ? Math.floor(0.8 * reserveTokens) : Math.floor(0.5 * reserveTokens);
}
