import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { padVisible, stripAnsi, truncateAnsi, visibleWidth } from "./tui-text.ts";

const MIN_WIDTH = 48;
const TARGET_WIDTH = 92;
const MAX_HEIGHT = 24;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;
const ESCAPE_CHARACTER_PATTERN = /\u001b/g;
const KITTY_UP_PATTERN = /^\u001b\[1;1(?::[12])?A/;
const KITTY_DOWN_PATTERN = /^\u001b\[1;1(?::[12])?B/;
const KITTY_HOME_PATTERN = /^\u001b\[1;1(?::[12])?H/;
const KITTY_END_PATTERN = /^\u001b\[1;1(?::[12])?F/;
const KITTY_PAGE_UP_PATTERN = /^\u001b\[5(?:;1)?(?::[12])?~/;
const KITTY_PAGE_DOWN_PATTERN = /^\u001b\[6(?:;1)?(?::[12])?~/;
const KITTY_HOME_FUNCTION_PATTERN = /^\u001b\[7(?:;1)?(?::[12])?~/;
const KITTY_END_FUNCTION_PATTERN = /^\u001b\[8(?:;1)?(?::[12])?~/;

type ViewerColor = "accent" | "border" | "dim" | "muted";

interface ViewerTheme {
	fg(color: ViewerColor, text: string): string;
	bold(text: string): string;
}

export interface ScrollableTextOverlayOptions {
	title: string;
	content: string;
	headerLines?: string[];
	footer?: string;
}

/** Strip untrusted terminal controls before rendering model/session text in overlays. */
export function sanitizeOverlayText(content: string): string {
	return stripAnsi(content)
		.replace(/\t/g, "    ")
		.replace(/\r\n?/g, "\n")
		.replace(CONTROL_CHARACTER_PATTERN, "")
		.replace(ESCAPE_CHARACTER_PATTERN, "");
}

function topLine(theme: ViewerTheme, width: number, title: string): string {
	const label = ` ${title} `;
	const fill = Math.max(0, width - visibleWidth(label) - 2);
	return `${theme.fg("border", "+")}${theme.fg("accent", label)}${theme.fg("border", `${"-".repeat(fill)}+`)}`;
}

function bottomLine(theme: ViewerTheme, width: number): string {
	const inner = Math.max(0, width - 2);
	return theme.fg("border", `+${"-".repeat(inner)}+`);
}

function frame(theme: ViewerTheme, width: number, content: string): string {
	const inner = Math.max(0, width - 2);
	const safe = padVisible(truncateAnsi(content, inner), inner);
	return `${theme.fg("border", "|")}${safe}${theme.fg("border", "|")}`;
}

function wrapPlainLine(line: string, width: number): string[] {
	if (width <= 0) return [""];
	if (visibleWidth(line) <= width) return [line];
	const chunks: string[] = [];
	let current = "";
	for (const char of Array.from(line)) {
		if (visibleWidth(current + char) > width) {
			chunks.push(current);
			current = char;
		} else {
			current += char;
		}
	}
	chunks.push(current);
	return chunks;
}

function prepareTextLines(content: string, width: number): string[] {
	const inner = Math.max(1, width - 4);
	const cleaned = sanitizeOverlayText(content).trimEnd();
	if (cleaned.trim().length === 0) return ["(empty)"];
	const result: string[] = [];
	for (const line of cleaned.split("\n")) {
		for (const wrapped of wrapPlainLine(line, inner)) result.push(wrapped);
	}
	return result.length > 0 ? result : ["(empty)"];
}

function repeatCount(data: string, sequences: string[]): number {
	for (const sequence of sequences) {
		if (data === sequence) return 1;
		if (sequence.length === 0 || data.length <= sequence.length) continue;
		if (data.length % sequence.length !== 0) continue;
		const count = data.length / sequence.length;
		if (sequence.repeat(count) === data) return count;
	}
	return 0;
}

function repeatedPatternCount(data: string, patterns: RegExp[]): number {
	for (const pattern of patterns) {
		let index = 0;
		let count = 0;
		while (index < data.length) {
			const match = pattern.exec(data.slice(index));
			if (!match || match.index !== 0 || match[0].length === 0) {
				count = 0;
				break;
			}
			index += match[0].length;
			count += 1;
		}
		if (count > 0) return count;
	}
	return 0;
}

function repeatCountFor(data: string, sequences: string[], patterns: RegExp[]): number {
	return Math.max(repeatCount(data, sequences), repeatedPatternCount(data, patterns));
}

function keyRepeat(data: string, key: "up" | "down" | "page-up" | "page-down" | "home" | "end" | "close"): number {
	if (key === "up") return repeatCountFor(data, ["up", "k", "\u001b[A", "\u001bOA"], [KITTY_UP_PATTERN]);
	if (key === "down") return repeatCountFor(data, ["down", "j", "\u001b[B", "\u001bOB"], [KITTY_DOWN_PATTERN]);
	if (key === "page-up") return repeatCountFor(data, ["pageup", "page-up", "\u001b[5~", "\u001b[[5~"], [KITTY_PAGE_UP_PATTERN]);
	if (key === "page-down") return repeatCountFor(data, ["pagedown", "page-down", "\u001b[6~", "\u001b[[6~"], [KITTY_PAGE_DOWN_PATTERN]);
	if (key === "home") return repeatCountFor(data, ["home", "\u001b[H", "\u001bOH", "\u001b[1~", "\u001b[7~"], [KITTY_HOME_PATTERN, KITTY_HOME_FUNCTION_PATTERN]);
	if (key === "end") return repeatCountFor(data, ["end", "\u001b[F", "\u001bOF", "\u001b[4~", "\u001b[8~"], [KITTY_END_PATTERN, KITTY_END_FUNCTION_PATTERN]);
	return repeatCount(data, ["enter", "return", "\r", "\n", "escape", "q", "\u001b", "ctrl+c", "\u0003"]);
}

export class ScrollableTextOverlay {
	private scroll = 0;
	private cachedWidth: number | undefined;
	private cachedLines: string[] | undefined;
	private readonly title: string;
	private readonly content: string;
	private readonly headerLines: string[];
	private readonly footer: string;
	private readonly theme: ViewerTheme;
	private readonly done: () => void;
	private readonly requestRender: () => void;

	constructor(
		options: ScrollableTextOverlayOptions,
		theme: ViewerTheme,
		done: () => void,
		requestRender: () => void,
	) {
		this.title = sanitizeOverlayText(options.title).trim() || "Preview";
		this.content = sanitizeOverlayText(options.content);
		this.headerLines = (options.headerLines ?? []).map((line) => sanitizeOverlayText(line));
		this.footer = options.footer ?? "↑↓/j/k scroll | PgUp/PgDn page | Enter/q/Esc close";
		this.theme = theme;
		this.done = done;
		this.requestRender = requestRender;
	}

	handleInput(data: string): void {
		if (keyRepeat(data, "close") > 0) {
			this.done();
			return;
		}
		const lines = this.contentLines(this.cachedWidth ?? TARGET_WIDTH);
		const page = this.pageSize();
		const maxScroll = Math.max(0, lines.length - page);
		const before = this.scroll;
		const up = keyRepeat(data, "up");
		const down = keyRepeat(data, "down");
		const pageUp = keyRepeat(data, "page-up");
		const pageDown = keyRepeat(data, "page-down");
		if (up > 0) this.scroll = Math.max(0, this.scroll - up);
		if (down > 0) this.scroll = Math.min(maxScroll, this.scroll + down);
		if (pageUp > 0) this.scroll = Math.max(0, this.scroll - page * pageUp);
		if (pageDown > 0) this.scroll = Math.min(maxScroll, this.scroll + page * pageDown);
		if (keyRepeat(data, "home") > 0) this.scroll = 0;
		if (keyRepeat(data, "end") > 0) this.scroll = maxScroll;
		if (before !== this.scroll) this.requestRender();
	}

	render(width: number): string[] {
		if (width < MIN_WIDTH) return [truncateAnsi("Widen the terminal to view this panel", width)];
		const overlayWidth = Math.min(width, TARGET_WIDTH);
		const content = this.contentLines(overlayWidth);
		const page = this.pageSize();
		const maxScroll = Math.max(0, content.length - page);
		this.scroll = Math.min(this.scroll, maxScroll);
		const visible = content.slice(this.scroll, this.scroll + page);
		const scrollLabel = content.length > page
			? `lines ${this.scroll + 1}-${Math.min(content.length, this.scroll + page)} of ${content.length}`
			: `${content.length} lines`;
		return [
			topLine(this.theme, overlayWidth, this.title),
			...this.headerLines.map((line) => frame(this.theme, overlayWidth, ` ${this.theme.fg("dim", line)}`)),
			frame(this.theme, overlayWidth, ` ${this.theme.fg("dim", scrollLabel)}`),
			frame(this.theme, overlayWidth, ""),
			...visible.map((line) => frame(this.theme, overlayWidth, ` ${line}`)),
			frame(this.theme, overlayWidth, ""),
			frame(this.theme, overlayWidth, ` ${this.theme.fg("dim", this.footer)}`),
			bottomLine(this.theme, overlayWidth),
		];
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}

	private pageSize(): number {
		return Math.max(1, MAX_HEIGHT - this.headerLines.length - 6);
	}

	private contentLines(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;
		this.cachedLines = prepareTextLines(this.content, width);
		this.cachedWidth = width;
		return this.cachedLines;
	}
}

export async function showScrollableTextOverlay(
	ctx: ExtensionContext,
	options: ScrollableTextOverlayOptions,
): Promise<boolean> {
	if (!ctx.hasUI) return false;
	let supported = false;
	await ctx.ui.custom<void>(
		(tui, theme, _keybindings, done) => {
			supported = true;
			return new ScrollableTextOverlay(options, theme, () => done(), () => tui.requestRender());
		},
		{
			overlay: true,
			overlayOptions: {
				width: TARGET_WIDTH,
				minWidth: MIN_WIDTH,
				maxHeight: MAX_HEIGHT,
				anchor: "center",
				margin: 1,
			},
		},
	);
	return supported;
}
