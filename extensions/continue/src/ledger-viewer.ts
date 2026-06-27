import type { ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { extractTaggedBlock } from "./blocks.ts";
import { ScrollableTextOverlay, sanitizeOverlayText } from "./text-viewer.ts";
import type { ContinuationLedgerSnapshot } from "./types.ts";

interface LedgerTheme {
	fg(color: "accent" | "border" | "dim" | "muted", text: string): string;
	bold(text: string): string;
}

interface LedgerOverlayHandle {
	focus(): void;
	hide(): void;
}

interface TrackedLedgerOverlay {
	overlay: ContinuationLedgerOverlay;
	handle: LedgerOverlayHandle | undefined;
	closedByUser: boolean;
	closeRequested: boolean;
}

const openLedgerOverlays = new Set<TrackedLedgerOverlay>();
let activeLedgerOverlay: TrackedLedgerOverlay | undefined;

function ledgerHeaderLines(ledger: ContinuationLedgerSnapshot): string[] {
	return [
		`run ${ledger.eventId ?? "unknown"} | compaction ${ledger.compactionEntryId}`,
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
		super(ledgerOverlayOptions(ledger), theme, done, requestRender);
	}

	setLedger(ledger: ContinuationLedgerSnapshot): void {
		this.update(ledgerOverlayOptions(ledger));
	}
}

function ledgerOverlayOptions(ledger: ContinuationLedgerSnapshot) {
	return {
		title: "Continuation Ledger",
		content: ledger.content,
		headerLines: ledgerHeaderLines(ledger),
	};
}

function forgetLedgerOverlay(entry: TrackedLedgerOverlay | undefined): void {
	if (!entry) return;
	openLedgerOverlays.delete(entry);
	if (activeLedgerOverlay === entry) activeLedgerOverlay = undefined;
}

export function closeContinuationLedgerOverlays(): void {
	const open = [...openLedgerOverlays];
	for (const entry of open) {
		if (!entry.closedByUser) entry.closeRequested = true;
		forgetLedgerOverlay(entry);
	}
	for (const entry of open.filter((entry) => !entry.closedByUser).reverse()) {
		entry.handle?.hide();
	}
}

export function clearContinuationLedgerOverlay(): void {
	closeContinuationLedgerOverlays();
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
	singleOverlay = true,
): Promise<boolean> {
	if (!ctx.hasUI) return false;
	if (singleOverlay && activeLedgerOverlay) {
		activeLedgerOverlay.overlay.setLedger(ledger);
		activeLedgerOverlay.handle?.focus();
		return true;
	}
	let supported = false;
	let entry: TrackedLedgerOverlay | undefined;
	const lifecycle = ctx.ui.custom<void>(
		(tui, theme, _keybindings, done) => {
			supported = true;
			const overlay = new ContinuationLedgerOverlay(ledger, theme, () => {
				if (entry) entry.closedByUser = true;
				done();
			}, () => tui.requestRender());
			entry = { overlay, handle: undefined, closedByUser: false, closeRequested: false };
			openLedgerOverlays.add(entry);
			if (singleOverlay) activeLedgerOverlay = entry;
			return overlay;
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
			onHandle: (handle) => {
				if (entry) {
					entry.handle = handle;
					if (entry.closeRequested) handle.hide();
				}
			},
		},
	);
	void lifecycle.catch(() => undefined).finally(() => {
		forgetLedgerOverlay(entry);
	});
	await Promise.resolve();
	return supported;
}

export function showContinuationLedgerOverlaySoon(
	ctx: ExtensionContext,
	ledger: ContinuationLedgerSnapshot,
	singleOverlay: boolean,
	onError: (reason: string) => void,
): void {
	void showContinuationLedgerOverlay(ctx, ledger, singleOverlay)
		.then((shown) => {
			if (!shown) onError("Continuation Ledger cannot open in this Pi mode.");
		})
		.catch(() => {
			onError("Continuation Ledger could not open.");
		});
}

export async function showLatestContinuationLedger(
	ctx: ExtensionCommandContext,
	ledger: ContinuationLedgerSnapshot | undefined,
	singleOverlay = true,
): Promise<void> {
	if (!ledger) {
		if (ctx.hasUI) ctx.ui.notify("No Continuation Ledger has been created in this session yet.", "warning");
		return;
	}
	const shown = await showContinuationLedgerOverlay(ctx, ledger, singleOverlay);
	if (!shown && ctx.hasUI) {
		ctx.ui.notify("Continuation Ledger cannot open in this Pi mode.", "warning");
	}
}
