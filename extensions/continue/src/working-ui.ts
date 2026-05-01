import type { ExtensionContext, WorkingIndicatorOptions } from "@mariozechner/pi-coding-agent";
import type { ContinuationRuntimeState } from "./runtime.ts";

interface WorkingUiState {
	activeEventId: string | undefined;
}

const states = new WeakMap<ContinuationRuntimeState, WorkingUiState>();

function stateFor(runtime: ContinuationRuntimeState): WorkingUiState {
	const existing = states.get(runtime);
	if (existing) return existing;
	const next: WorkingUiState = { activeEventId: undefined };
	states.set(runtime, next);
	return next;
}

function workingIndicator(ctx: ExtensionContext): WorkingIndicatorOptions {
	return {
		frames: [
			ctx.ui.theme.fg("dim", "·"),
			ctx.ui.theme.fg("muted", "•"),
			ctx.ui.theme.fg("accent", "●"),
			ctx.ui.theme.fg("muted", "•"),
		],
		intervalMs: 120,
	};
}

export function beginWorkingVisuals(
	ctx: ExtensionContext,
	runtime: ContinuationRuntimeState,
	eventId: string,
	message: string,
): void {
	if (!ctx.hasUI) return;
	const state = stateFor(runtime);
	state.activeEventId = eventId;
	ctx.ui.setWorkingMessage(message);
	ctx.ui.setWorkingIndicator(workingIndicator(ctx));
}

export function settleWorkingVisuals(ctx: ExtensionContext, runtime: ContinuationRuntimeState, eventId: string | undefined): void {
	if (!ctx.hasUI) return;
	const state = stateFor(runtime);
	if (!eventId || state.activeEventId !== eventId) return;
	state.activeEventId = undefined;
	ctx.ui.setWorkingMessage();
	ctx.ui.setWorkingIndicator();
}

export function clearWorkingVisuals(ctx: ExtensionContext, runtime: ContinuationRuntimeState): void {
	if (!ctx.hasUI) return;
	const state = stateFor(runtime);
	if (state.activeEventId) {
		ctx.ui.setWorkingMessage();
		ctx.ui.setWorkingIndicator();
	}
	state.activeEventId = undefined;
}
