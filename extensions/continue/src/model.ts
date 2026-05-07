import type { Api, Model, ModelThinkingLevel, ThinkingLevel } from "@earendil-works/pi-ai";
import { clampThinkingLevel, completeSimple } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { resolveSummarizerModel } from "./model-settings.ts";
import type { ContinuationConfig, PromptPassTelemetry } from "./types.ts";

export { resolveSummarizerModel, resolveTokenBudget } from "./model-settings.ts";

export interface PromptPassResult extends PromptPassTelemetry {
	text: string;
}

function requestedThinkingLevel(pi: Pick<ExtensionAPI, "getThinkingLevel">, config: ContinuationConfig): ModelThinkingLevel {
	return config.reasoning === "inherit" ? pi.getThinkingLevel() : config.reasoning;
}

/** Resolve the requested reasoning level through Pi's model-specific thinking capability map. */
export function resolveReasoningLevel(pi: Pick<ExtensionAPI, "getThinkingLevel">, model: Model<Api>, config: ContinuationConfig): ThinkingLevel | undefined {
	if (!model.reasoning) return undefined;
	const level = clampThinkingLevel(model, requestedThinkingLevel(pi, config));
	return level === "off" ? undefined : level;
}

/** Execute a summarization pass against the resolved model and auth. */
export async function runPromptPass(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	config: ContinuationConfig,
	prompt: { systemPrompt: string; userPrompt: string },
	maxTokens: number,
	signal: AbortSignal,
): Promise<PromptPassResult> {
	const model = resolveSummarizerModel(ctx, config);
	if (!model) {
		throw new Error(`Unable to resolve summarizer model from setting ${config.summarizerModel}`);
	}
	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
	if (!auth.ok) {
		throw new Error(auth.error);
	}
	const reasoning = resolveReasoningLevel(pi, model, config);
	let httpStatus: number | undefined;
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
					onResponse: (providerResponse) => {
						httpStatus = providerResponse.status;
					},
				}
			: {
					apiKey: auth.apiKey,
					headers: auth.headers,
					maxTokens,
					signal,
					onResponse: (providerResponse) => {
						httpStatus = providerResponse.status;
					},
				},
	);
	if (response.stopReason === "error") {
		throw new Error(response.errorMessage || "Unknown compaction synthesis error");
	}
	if (response.stopReason === "aborted") {
		throw new Error("Compaction synthesis was aborted");
	}
	const text = response.content
		.filter((block): block is { type: "text"; text: string } => block.type === "text")
		.map((block) => block.text)
		.join("\n")
		.trim();
	return {
		text,
		requestedModel: `${model.provider}/${model.id}`,
		responseModel: response.responseModel,
		responseId: response.responseId,
		usage: {
			input: response.usage.input,
			output: response.usage.output,
			cacheRead: response.usage.cacheRead,
			cacheWrite: response.usage.cacheWrite,
			totalTokens: response.usage.totalTokens,
			costTotal: response.usage.cost.total,
		},
		httpStatus,
	};
}
