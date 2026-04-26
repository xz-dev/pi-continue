import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { DEFAULT_CONTINUE_CONFIG, loadContinuationConfig } from "./config.ts";
import { readEffectivePiCompactionSettings } from "./pi-settings.ts";
import { resolveProjectContext } from "./project.ts";
import type { ContinuationRequestMode, ContinuationRuntimeState } from "./runtime.ts";
import { padVisible, truncateAnsi, visibleWidth } from "./tui-text.ts";
import type { ConfigScope, ContinuationConfig } from "./types.ts";

const CURSOR_MARKER = "\u001b_pi:c\u0007";

type MenuColor = "accent" | "border" | "dim" | "muted" | "warning";

interface MenuTheme {
	fg(color: MenuColor, text: string): string;
	bold(text: string): string;
}

type OperatorAction = "status" | "preview" | "settings" | "reset";
type FocusActionId = "continue-now" | "queue" | "preview";
type ActionId = FocusActionId | "status" | "settings-project" | "settings-global" | "reset-project" | "reset-global";

interface MenuAction {
	id: ActionId;
	section: "Continue" | "Inspect" | "Configure";
	label: string;
	description: string;
	consequence: string;
	shortcut: string;
	focusLabel?: string;
	blankHelp?: string;
}

interface FocusState {
	text: string;
	cursor: number;
}

export interface ContinueMenuSelection {
	kind: "continue";
	mode: ContinuationRequestMode;
	instructions: string | undefined;
}

export interface OperatorMenuSelection {
	kind: OperatorAction;
	scope?: ConfigScope;
	instructions?: string;
}

export type ContinueMenuResult = ContinueMenuSelection | OperatorMenuSelection;

interface ContinueMenuSnapshot {
	enabled: boolean;
	projectRoot: string;
	config: ContinuationConfig;
	threshold: string;
	contextUsage: string;
	compactionRunning: boolean;
}

const MENU_ACTIONS: MenuAction[] = [
	{
		id: "continue-now",
		section: "Continue",
		label: "Continue now",
		description: "Compact now, then resume the same task in this session.",
		consequence: "If Pi is running, the active turn is aborted before compaction starts.",
		shortcut: "/continue steer [focus]",
		focusLabel: "Focus, optional",
		blankHelp: "Leave blank to continue normally.",
	},
	{
		id: "queue",
		section: "Continue",
		label: "Queue until idle",
		description: "Wait for Pi to finish the current run, then compact and resume.",
		consequence: "Running tools are left alone; compaction starts at the next idle point.",
		shortcut: "/continue queue [focus]",
		focusLabel: "Focus, optional",
		blankHelp: "Leave blank to continue normally.",
	},
	{
		id: "status",
		section: "Inspect",
		label: "Status",
		description: "Show effective config, prompt sources, and the Pi compaction trigger.",
		consequence: "Opens a read-only status document.",
		shortcut: "/continue status",
	},
	{
		id: "preview",
		section: "Inspect",
		label: "Preview prompts",
		description: "Render the exact summarization prompt payloads that would be used now.",
		consequence: "No compaction starts; this is inspection only.",
		shortcut: "/continue preview [focus]",
		focusLabel: "Preview focus, optional",
		blankHelp: "Leave blank to preview normal compaction prompts.",
	},
	{
		id: "settings-project",
		section: "Configure",
		label: "Project settings",
		description: "Edit this repository's pi-continue settings.",
		consequence: "Writes <project>/.pi/extensions/pi-continue.json when settings change.",
		shortcut: "/continue settings project",
	},
	{
		id: "settings-global",
		section: "Configure",
		label: "Global settings",
		description: "Edit pi-continue settings shared by all projects.",
		consequence: "Writes ~/.pi/agent/extensions/pi-continue.json when settings change.",
		shortcut: "/continue settings global",
	},
	{
		id: "reset-project",
		section: "Configure",
		label: "Reset project config",
		description: "Delete this repository's pi-continue config after confirmation.",
		consequence: "Project settings fall back to global settings and package defaults.",
		shortcut: "/continue reset project",
	},
	{
		id: "reset-global",
		section: "Configure",
		label: "Reset global config",
		description: "Delete the shared pi-continue config after confirmation.",
		consequence: "All projects without overrides fall back to package defaults.",
		shortcut: "/continue reset global",
	},
];

function isFocusActionId(actionId: ActionId): actionId is FocusActionId {
	return actionId === "continue-now" || actionId === "queue" || actionId === "preview";
}

function instructionsFromState(state: FocusState): string | undefined {
	const trimmed = state.text.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function selectionFor(action: MenuAction, focusStates: { [key in FocusActionId]: FocusState }): ContinueMenuResult {
	if (action.id === "continue-now") {
		return { kind: "continue", mode: "steer", instructions: instructionsFromState(focusStates["continue-now"]) };
	}
	if (action.id === "queue") {
		return { kind: "continue", mode: "queue", instructions: instructionsFromState(focusStates.queue) };
	}
	if (action.id === "preview") {
		return { kind: "preview", instructions: instructionsFromState(focusStates.preview) };
	}
	if (action.id === "settings-project") return { kind: "settings", scope: "project" };
	if (action.id === "settings-global") return { kind: "settings", scope: "global" };
	if (action.id === "reset-project") return { kind: "reset", scope: "project" };
	if (action.id === "reset-global") return { kind: "reset", scope: "global" };
	return { kind: "status" };
}

function keyMatches(data: string, key: "up" | "down" | "left" | "right" | "enter" | "escape" | "backspace" | "delete" | "home" | "end" | "tab" | "shift-tab"): boolean {
	if (key === "up") return data === "up" || data === "\u001b[A";
	if (key === "down") return data === "down" || data === "\u001b[B";
	if (key === "left") return data === "left" || data === "\u001b[D";
	if (key === "right") return data === "right" || data === "\u001b[C";
	if (key === "enter") return data === "enter" || data === "return" || data === "\r" || data === "\n";
	if (key === "escape") return data === "escape" || data === "\u001b";
	if (key === "backspace") return data === "backspace" || data === "\u007f" || data === "\b";
	if (key === "delete") return data === "delete" || data === "\u001b[3~";
	if (key === "home") return data === "home" || data === "\u001b[H" || data === "\u001b[1~";
	if (key === "end") return data === "end" || data === "\u001b[F" || data === "\u001b[4~";
	if (key === "tab") return data === "tab" || data === "\t";
	return data === "shift+tab" || data === "shift-tab" || data === "\u001b[Z";
}

function isPrintable(data: string): boolean {
	if (data.length === 0) return false;
	for (const char of data) {
		const code = char.codePointAt(0);
		if (code === undefined || code < 32 || code === 127) return false;
	}
	return !data.includes("\u001b");
}

function line(theme: MenuTheme, width: number, left: string, fill: string, right: string): string {
	const inner = Math.max(0, width - 2);
	return theme.fg("border", `${left}${fill.repeat(inner)}${right}`);
}

function frame(theme: MenuTheme, width: number, content: string): string {
	const inner = Math.max(0, width - 2);
	const safe = padVisible(truncateAnsi(content, inner), inner);
	return `${theme.fg("border", "|")}${safe}${theme.fg("border", "|")}`;
}

function joinColumns(left: string, right: string, leftWidth: number, rightWidth: number, theme: MenuTheme): string {
	const safeLeft = padVisible(truncateAnsi(left, leftWidth), leftWidth);
	const safeRight = padVisible(truncateAnsi(right, rightWidth), rightWidth);
	return `${safeLeft} ${theme.fg("border", "|")} ${safeRight}`;
}

function previousCursorIndex(text: string, cursor: number): number {
	const before = Array.from(text.slice(0, cursor));
	const previous = before[before.length - 1];
	return previous ? cursor - previous.length : 0;
}

function nextCursorIndex(text: string, cursor: number): number {
	const next = Array.from(text.slice(cursor))[0];
	return next ? Math.min(text.length, cursor + next.length) : text.length;
}

function renderField(state: FocusState, active: boolean): string {
	const value = state.text.length > 0 ? state.text : "blank = normal";
	if (!active) return `[${value}]`;
	if (state.text.length === 0) return `[${CURSOR_MARKER}\u001b[7m \u001b[27mblank = normal]`;
	const before = state.text.slice(0, state.cursor);
	const cursorChar = state.cursor < state.text.length ? Array.from(state.text.slice(state.cursor))[0] ?? " " : " ";
	const after = state.text.slice(state.cursor + cursorChar.length);
	return `[${before}${CURSOR_MARKER}\u001b[7m${cursorChar}\u001b[27m${after}]`;
}

function renderThreshold(contextWindow: number | undefined, reserveTokens: number): string {
	if (!contextWindow || !Number.isFinite(contextWindow) || contextWindow <= reserveTokens) return "unavailable";
	const thresholdTokens = contextWindow - reserveTokens;
	const percent = (thresholdTokens / contextWindow) * 100;
	return `${thresholdTokens.toLocaleString()} tokens (${percent.toFixed(1)}% of ${contextWindow.toLocaleString()})`;
}

function renderUsage(ctx: ExtensionCommandContext): string {
	const usage = ctx.getContextUsage();
	if (!usage || usage.tokens === null || usage.percent === null) return "unavailable";
	return `${usage.tokens.toLocaleString()}/${usage.contextWindow.toLocaleString()} tokens (${usage.percent.toFixed(1)}%)`;
}

async function buildMenuSnapshot(pi: ExtensionAPI, ctx: ExtensionCommandContext, runtime: ContinuationRuntimeState): Promise<ContinueMenuSnapshot> {
	const initialProjectContext = await resolveProjectContext(pi, ctx.cwd, DEFAULT_CONTINUE_CONFIG.continuationDocPath);
	const config = loadContinuationConfig(initialProjectContext.projectRoot);
	const projectContext = await resolveProjectContext(pi, ctx.cwd, config.continuationDocPath, config.agentGuidePath);
	const compaction = readEffectivePiCompactionSettings(projectContext.projectRoot);
	const contextWindow = ctx.model?.contextWindow ?? ctx.getContextUsage()?.contextWindow;
	return {
		enabled: config.enabled,
		projectRoot: projectContext.projectRoot,
		config,
		threshold: renderThreshold(contextWindow, compaction.reserveTokens),
		contextUsage: renderUsage(ctx),
		compactionRunning: runtime.compactionRunning,
	};
}

export class ContinueMenuComponent {
	focused = false;
	private selectedIndex = 0;
	private readonly snapshot: ContinueMenuSnapshot;
	private readonly theme: MenuTheme;
	private readonly done: (result: ContinueMenuResult | undefined) => void;
	private readonly requestRender: () => void;
	private readonly focusStates: { [key in FocusActionId]: FocusState } = {
		"continue-now": { text: "", cursor: 0 },
		queue: { text: "", cursor: 0 },
		preview: { text: "", cursor: 0 },
	};

	constructor(
		snapshot: ContinueMenuSnapshot,
		theme: MenuTheme,
		done: (result: ContinueMenuResult | undefined) => void,
		requestRender: () => void,
	) {
		this.snapshot = snapshot;
		this.theme = theme;
		this.done = done;
		this.requestRender = requestRender;
	}

	handleInput(data: string): void {
		if (keyMatches(data, "escape")) {
			this.done(undefined);
			return;
		}
		if (keyMatches(data, "enter")) {
			this.done(selectionFor(MENU_ACTIONS[this.selectedIndex] ?? MENU_ACTIONS[0], this.focusStates));
			return;
		}
		if (keyMatches(data, "up") || keyMatches(data, "shift-tab")) {
			this.selectedIndex = Math.max(0, this.selectedIndex - 1);
			this.requestRender();
			return;
		}
		if (keyMatches(data, "down") || keyMatches(data, "tab")) {
			this.selectedIndex = Math.min(MENU_ACTIONS.length - 1, this.selectedIndex + 1);
			this.requestRender();
			return;
		}
		const selected = MENU_ACTIONS[this.selectedIndex];
		if (!selected || !isFocusActionId(selected.id)) return;
		const state = this.focusStates[selected.id];
		if (keyMatches(data, "left")) {
			state.cursor = previousCursorIndex(state.text, state.cursor);
		} else if (keyMatches(data, "right")) {
			state.cursor = nextCursorIndex(state.text, state.cursor);
		} else if (keyMatches(data, "home")) {
			state.cursor = 0;
		} else if (keyMatches(data, "end")) {
			state.cursor = state.text.length;
		} else if (keyMatches(data, "backspace")) {
			if (state.cursor > 0) {
				const previous = previousCursorIndex(state.text, state.cursor);
				state.text = `${state.text.slice(0, previous)}${state.text.slice(state.cursor)}`;
				state.cursor = previous;
			}
		} else if (keyMatches(data, "delete")) {
			if (state.cursor < state.text.length) {
				const next = nextCursorIndex(state.text, state.cursor);
				state.text = `${state.text.slice(0, state.cursor)}${state.text.slice(next)}`;
			}
		} else if (data === "\u0015") {
			state.text = state.text.slice(state.cursor);
			state.cursor = 0;
		} else if (isPrintable(data)) {
			state.text = `${state.text.slice(0, state.cursor)}${data}${state.text.slice(state.cursor)}`;
			state.cursor += data.length;
		} else {
			return;
		}
		this.requestRender();
	}

	render(width: number): string[] {
		if (width < 44) return [truncateAnsi("pi-continue menu needs a wider terminal", width)];
		const menuWidth = Math.min(width, 108);
		const innerWidth = menuWidth - 2;
		const selected = MENU_ACTIONS[this.selectedIndex] ?? MENU_ACTIONS[0];
		const lines = [
			line(this.theme, menuWidth, "+", "-", "+"),
			frame(this.theme, menuWidth, ` ${this.theme.fg("accent", this.theme.bold("Continue"))} ${this.theme.fg("dim", "same-session compaction and resume")}`),
			frame(this.theme, menuWidth, ""),
		];
		if (innerWidth >= 82) {
			const leftWidth = 32;
			const rightWidth = innerWidth - leftWidth - 3;
			const left = this.renderActionTree();
			const right = this.renderDetail(selected);
			const count = Math.max(left.length, right.length);
			for (let index = 0; index < count; index += 1) {
				lines.push(frame(this.theme, menuWidth, joinColumns(left[index] ?? "", right[index] ?? "", leftWidth, rightWidth, this.theme)));
			}
		} else {
			for (const treeLine of this.renderActionTree()) lines.push(frame(this.theme, menuWidth, treeLine));
			lines.push(frame(this.theme, menuWidth, ""));
			for (const detailLine of this.renderDetail(selected)) lines.push(frame(this.theme, menuWidth, detailLine));
		}
		lines.push(frame(this.theme, menuWidth, ""));
		lines.push(frame(this.theme, menuWidth, this.theme.fg("dim", "Up/Down browse | type in focus fields | Enter run | Esc close")));
		lines.push(line(this.theme, menuWidth, "+", "-", "+"));
		return lines;
	}

	invalidate(): void {}
	dispose(): void {}

	private renderActionTree(): string[] {
		const lines: string[] = [];
		let currentSection = "";
		for (let index = 0; index < MENU_ACTIONS.length; index += 1) {
			const action = MENU_ACTIONS[index];
			if (!action) continue;
			if (action.section !== currentSection) {
				if (lines.length > 0) lines.push("");
				currentSection = action.section;
				lines.push(this.theme.fg("muted", action.section));
			}
			const selected = index === this.selectedIndex;
			const pointer = selected ? ">" : " ";
			const label = selected ? this.theme.fg("accent", action.label) : action.label;
			lines.push(` ${pointer} ${label}`);
		}
		return lines;
	}

	private renderDetail(action: MenuAction): string[] {
		const state = isFocusActionId(action.id) ? this.focusStates[action.id] : undefined;
		const lines = [
			this.theme.fg("accent", this.theme.bold(action.label)),
			action.description,
			"",
			this.theme.fg("muted", "Effect"),
			`- ${action.consequence}`,
		];
		if (state && action.focusLabel && action.blankHelp) {
			lines.push("", this.theme.fg("muted", action.focusLabel), renderField(state, this.focused), this.theme.fg("dim", action.blankHelp));
		}
		lines.push("", this.theme.fg("muted", "Shortcut"), action.shortcut, "", this.theme.fg("muted", "Current state"));
		lines.push(`- Enabled: ${this.snapshot.enabled ? "yes" : this.theme.fg("warning", "no")}`);
		lines.push(`- Mid-run guard: ${this.snapshot.config.midRunGuardEnabled ? "on" : "off"}`);
		lines.push(`- Context now: ${this.snapshot.contextUsage}`);
		lines.push(`- Trigger: ${this.snapshot.threshold}`);
		lines.push(`- Continuation doc: ${this.snapshot.config.continuationDocSyncMode}`);
		lines.push(`- Agent guide writes: ${this.snapshot.config.agentGuideSyncMode}`);
		lines.push(`- Compaction running: ${this.snapshot.compactionRunning ? "yes" : "no"}`);
		lines.push(`- Project: ${this.snapshot.projectRoot}`);
		if (!this.snapshot.enabled) lines.push("", this.theme.fg("warning", "Continuations are disabled. Open settings to re-enable."));
		return lines;
	}
}

/** Show the discoverable /continue action tree and return the selected action. */
export async function showContinueMenu(pi: ExtensionAPI, ctx: ExtensionCommandContext, runtime: ContinuationRuntimeState): Promise<ContinueMenuResult | undefined> {
	const snapshot = await buildMenuSnapshot(pi, ctx, runtime);
	return ctx.ui.custom<ContinueMenuResult | undefined>(
		(tui, theme, _keybindings, done) => new ContinueMenuComponent(snapshot, theme, done, () => tui.requestRender()),
		{
			overlay: true,
			overlayOptions: {
				width: "86%",
				minWidth: 72,
				maxHeight: "90%",
				anchor: "center",
				margin: 2,
			},
		},
	);
}
