import type { ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { extractTaggedBlock } from "./blocks.ts";
import { sanitizeEventReason } from "./continuation-event.ts";
import { ScrollableTextOverlay, sanitizeOverlayText, showScrollableTextOverlay } from "./text-viewer.ts";
import type { ContinuationLedgerSnapshot } from "./types.ts";

interface LedgerTheme {
	fg(color: "accent" | "border" | "dim" | "muted", text: string): string;
	bold(text: string): string;
}

function ledgerHeaderLines(ledger: ContinuationLedgerSnapshot): string[] {
	return [
		`event ${ledger.eventId ?? "unknown"} | compaction ${ledger.compactionEntryId}`,
		new Date(ledger.capturedAt).toISOString(),
	];
}

export class ContinuationLedgerOverlay extends ScrollableTextOverlay {
	constructor(
		ledger: ContinuationLedgerSnapshot,
		theme: LedgerTheme,
		done: () => void,
		requestRender: () => void,
	) {
		super(
			{
				title: "Continuation Ledger",
				content: ledger.content,
				headerLines: ledgerHeaderLines(ledger),
			},
			theme,
			done,
			requestRender,
		);
	}
}

export function extractContinuationLedger(summary: string): string | undefined {
	return extractTaggedBlock(summary, "continuation");
}

export function buildLedgerSnapshot(
	summary: string,
	eventId: string | undefined,
	compactionEntryId: string,
): ContinuationLedgerSnapshot | undefined {
	const content = extractContinuationLedger(summary);
	if (!content) return undefined;
	return {
		eventId,
		compactionEntryId,
		content: sanitizeOverlayText(content),
		capturedAt: Date.now(),
	};
}

export async function showContinuationLedgerOverlay(
	ctx: ExtensionContext,
	ledger: ContinuationLedgerSnapshot,
): Promise<boolean> {
	if (!ctx.hasUI) return false;
	let supported = false;
	await ctx.ui.custom<void>(
		(tui, theme, _keybindings, done) => {
			supported = true;
			return new ContinuationLedgerOverlay(ledger, theme, () => done(), () => tui.requestRender());
		},
		{
			overlay: true,
			overlayOptions: {
				width: 92,
				minWidth: 48,
				maxHeight: 24,
				anchor: "center",
				margin: 1,
			},
		},
	);
	return supported;
}

export function showContinuationLedgerOverlaySoon(
	ctx: ExtensionContext,
	ledger: ContinuationLedgerSnapshot,
	onError: (reason: string) => void,
): void {
	void showContinuationLedgerOverlay(ctx, ledger)
		.then((shown) => {
			if (!shown) onError("Continuation Ledger overlay is unavailable in this Pi mode.");
		})
		.catch((error: unknown) => {
			const message = error instanceof Error ? error.message : String(error);
			onError(sanitizeEventReason(message));
		});
}

export async function showLatestContinuationLedger(
	ctx: ExtensionCommandContext,
	ledger: ContinuationLedgerSnapshot | undefined,
): Promise<void> {
	if (!ledger) {
		if (ctx.hasUI) ctx.ui.notify("No Continuation Ledger is available in this runtime yet.", "warning");
		return;
	}
	const shown = await showScrollableTextOverlay(ctx, {
		title: "Continuation Ledger",
		content: ledger.content,
		headerLines: ledgerHeaderLines(ledger),
	});
	if (!shown && ctx.hasUI) {
		ctx.ui.notify("Continuation Ledger overlay is unavailable in this Pi mode.", "warning");
	}
}
