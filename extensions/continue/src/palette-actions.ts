import type { ConfigScope } from "./types.ts";
import type { ContinuationRequestMode } from "./runtime.ts";

export type OperatorAction = "status" | "preview" | "ledger" | "settings" | "reset";
export type FocusActionId = "continue-now" | "queue" | "preview";
export type PaletteActionId = FocusActionId | "status" | "ledger" | "settings-project" | "settings-global" | "reset-project" | "reset-global";

export interface PaletteAction {
	id: PaletteActionId;
	section: "Continue" | "Inspect" | "Configure";
	label: string;
	desc: string;
	effect: string;
}

export interface ContinuePaletteSelection {
	kind: "continue";
	mode: ContinuationRequestMode;
	instructions: string | undefined;
}

export interface OperatorPaletteSelection {
	kind: OperatorAction;
	scope?: ConfigScope;
	instructions?: string;
}

export type ContinuePaletteResult = ContinuePaletteSelection | OperatorPaletteSelection;

export const PALETTE_ACTIONS: PaletteAction[] = [
	{
		id: "continue-now",
		section: "Continue",
		label: "Continue now",
		desc: "Compact now; resume this task.",
		effect: "Aborts active Pi work before compaction.",
	},
	{
		id: "queue",
		section: "Continue",
		label: "Queue until idle",
		desc: "Wait, then compact.",
		effect: "Running tools continue; compaction waits.",
	},
	{
		id: "preview",
		section: "Inspect",
		label: "Preview prompts",
		desc: "Show prompts; no compaction.",
		effect: "Opens a read-only prompt preview.",
	},
	{
		id: "status",
		section: "Inspect",
		label: "Status",
		desc: "Show aftercare, config, and trigger.",
		effect: "Opens a read-only status document.",
	},
	{
		id: "ledger",
		section: "Inspect",
		label: "Show ledger",
		desc: "Open latest Continuation Ledger.",
		effect: "Transient overlay; no transcript entry is appended.",
	},
	{
		id: "settings-project",
		section: "Configure",
		label: "Project settings",
		desc: "Edit repo config.",
		effect: "Writes project config on change.",
	},
	{
		id: "settings-global",
		section: "Configure",
		label: "Global settings",
		desc: "Edit shared config.",
		effect: "Writes global config on change.",
	},
	{
		id: "reset-project",
		section: "Configure",
		label: "Reset project",
		desc: "Remove repo config.",
		effect: "Repo uses global/default settings.",
	},
	{
		id: "reset-global",
		section: "Configure",
		label: "Reset global",
		desc: "Remove shared config.",
		effect: "Projects use package defaults.",
	},
];

export function isFocusActionId(actionId: PaletteActionId): actionId is FocusActionId {
	return actionId === "continue-now" || actionId === "queue" || actionId === "preview";
}

export function actionById(actionId: PaletteActionId): PaletteAction | undefined {
	return PALETTE_ACTIONS.find((action) => action.id === actionId);
}

export function selectionFor(action: PaletteAction, instructions: string | undefined): ContinuePaletteResult {
	const trimmed = instructions?.trim();
	const focus = trimmed && trimmed.length > 0 ? trimmed : undefined;
	if (action.id === "continue-now") return { kind: "continue", mode: "steer", instructions: focus };
	if (action.id === "queue") return { kind: "continue", mode: "queue", instructions: focus };
	if (action.id === "preview") return { kind: "preview", instructions: focus };
	if (action.id === "ledger") return { kind: "ledger" };
	if (action.id === "settings-project") return { kind: "settings", scope: "project" };
	if (action.id === "settings-global") return { kind: "settings", scope: "global" };
	if (action.id === "reset-project") return { kind: "reset", scope: "project" };
	if (action.id === "reset-global") return { kind: "reset", scope: "global" };
	return { kind: "status" };
}
