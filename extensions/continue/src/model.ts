import type { Model } from "@mariozechner/pi-ai";
import { completeSimple } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { resolveSummarizerModel } from "./model-settings.ts";
import type { ContinuationConfig, ContinuationReasoning } from "./types.ts";

export { resolveSummarizerModel, resolveTokenBudget } from "./model-settings.ts";

function isSupportedReasoning(level: ContinuationReasoning): level is Exclude<ContinuationReasoning, "inherit"> {
	return level !== "inherit";
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
