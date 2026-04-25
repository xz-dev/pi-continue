import type { Model } from "@mariozechner/pi-ai";
import { completeSimple } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { ContinuationConfig, ContinuationReasoning } from "./types.ts";

function isSupportedReasoning(level: ContinuationReasoning): level is Exclude<ContinuationReasoning, "inherit"> {
	return level !== "inherit";
}

/** Resolve the effective summarizer model from config or the current session model. */
export function resolveSummarizerModel(
	ctx: ExtensionContext,
	config: ContinuationConfig,
): Model<unknown> | undefined {
	if (config.summarizerModel === "inherit") return ctx.model;
	const slashIndex = config.summarizerModel.indexOf("/");
	if (slashIndex <= 0 || slashIndex === config.summarizerModel.length - 1) return undefined;
	const provider = config.summarizerModel.slice(0, slashIndex);
	const modelId = config.summarizerModel.slice(slashIndex + 1);
	return ctx.modelRegistry.find(provider, modelId);
}

/** Resolve the requested reasoning level with model capability checks. */
export function resolveReasoningLevel(pi: ExtensionAPI, model: Model<unknown>, config: ContinuationConfig): string | undefined {
	if (!model.reasoning) return undefined;
	if (config.reasoning === "inherit") {
		const inherited = pi.getThinkingLevel();
		return inherited !== "off" ? inherited : undefined;
	}
	return isSupportedReasoning(config.reasoning) && config.reasoning !== "off" ? config.reasoning : undefined;
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

/** Execute a summarization pass against the resolved model and auth. */
export async function runPromptPass(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	config: ContinuationConfig,
	prompt: { systemPrompt: string; userPrompt: string },
	maxTokens: number,
	signal: AbortSignal,
): Promise<string> {
	const model = resolveSummarizerModel(ctx, config);
	if (!model) {
		throw new Error(`Unable to resolve summarizer model from setting ${config.summarizerModel}`);
	}
	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
	if (!auth.ok) {
		throw new Error(auth.error);
	}
	const reasoning = resolveReasoningLevel(pi, model, config);
	const response = await completeSimple(
		model,
		{
			systemPrompt: prompt.systemPrompt,
			messages: [
				{
					role: "user",
					content: [{ type: "text", text: prompt.userPrompt }],
					timestamp: Date.now(),
				},
			],
		},
		reasoning
			? {
					apiKey: auth.apiKey,
					headers: auth.headers,
					maxTokens,
					reasoning,
					signal,
				}
			: {
					apiKey: auth.apiKey,
					headers: auth.headers,
					maxTokens,
					signal,
				},
	);
	if (response.stopReason === "error") {
		throw new Error(response.errorMessage || "Unknown compaction synthesis error");
	}
	return response.content
		.filter((block): block is { type: "text"; text: string } => block.type === "text")
		.map((block) => block.text)
		.join("\n")
		.trim();
}
