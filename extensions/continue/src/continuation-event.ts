import type {
	ContinuationArtifactStatus,
	ContinuationDocumentSyncStatus,
	ContinuationDocumentSyncTarget,
	ContinuationEventSource,
	ContinuationEventStore,
	ContinuationEventStatus,
	ContinuationLatestEvent,
	ContinuationPromptStatus,
	ContinuationSyncStatus,
	MidRunGuardTrigger,
} from "./types.ts";


function nowMs(): number {
	return Date.now();
}

function nextEventId(store: ContinuationEventStore): string {
	store.nextEventSequence += 1;
	return `continue-${store.nextEventSequence}`;
}

function defaultDocumentSync(): ContinuationDocumentSyncStatus {
	return {
		continuationDoc: "off",
		agentGuide: "off",
	};
}

function lowerFailure(value: string): string {
	return value.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Convert untrusted failures into allowlisted aftercare copy. Never returns raw provider, prompt, path, or document text. */
export function sanitizeEventReason(value: string): string {
	const compact = lowerFailure(value);
	if (compact.length === 0) return "Continuation failure detail was unavailable.";
	if (compact.includes("blocked") && compact.includes("retry")) {
		return "Repeated over-threshold retry was blocked after a failed compaction.";
	}
	if (compact.includes("shutdown") || compact.includes("shut down")) {
		return "Pi session shut down before continuation aftercare settled.";
	}
	if (compact.includes("prompt") && (compact.includes("send") || compact.includes("dispatch"))) {
		return "Continuation prompt dispatch failed.";
	}
	if (compact.includes("document") || compact.includes("eacces") || compact.includes("eperm") || compact.includes("enoent") || compact.includes("permission")) {
		return "Document sync failed; check the configured path and permissions.";
	}
	if (compact.includes("history pass") || compact.includes("split-prefix") || compact.includes("artifact") || compact.includes("json") || compact.includes("parse")) {
		return "Continuation artifact synthesis failed; fallback handled the compaction if enabled.";
	}
	if (compact.includes("provider") || compact.includes("model") || compact.includes("api") || compact.includes("auth") || compact.includes("unauthorized") || compact.includes("rate") || compact.includes("quota") || compact.includes("token")) {
		return "Summarizer provider failed; check model, authentication, or context settings.";
	}
	return "Continuation aftercare encountered an internal failure.";
}

function latestMatching(store: ContinuationEventStore, eventId: string | undefined): ContinuationLatestEvent | undefined {
	if (!eventId || !store.latestEvent || store.latestEvent.id !== eventId) return undefined;
	return store.latestEvent;
}

/** Return whether an event id still owns the latest continuation aftercare snapshot. */
export function isLatestContinuationEvent(store: ContinuationEventStore, eventId: string | undefined): boolean {
	return latestMatching(store, eventId) !== undefined;
}

/** Return whether a callback may still settle or advance the active running event. */
export function isActiveRunningContinuationEvent(store: ContinuationEventStore, eventId: string | undefined): boolean {
	const event = latestMatching(store, eventId);
	return event !== undefined && store.activeEventId === eventId && event.status === "running";
}

function activeLatest(store: ContinuationEventStore): ContinuationLatestEvent | undefined {
	return latestMatching(store, store.activeEventId);
}

function replaceLatest(store: ContinuationEventStore, next: ContinuationLatestEvent): void {
	store.latestEvent = next;
}

/** Start the single latest-event snapshot for a package-owned continuation run. */
export function beginContinuationEvent(
	store: ContinuationEventStore,
	source: ContinuationEventSource,
	trigger: MidRunGuardTrigger | undefined,
	promptStatus: ContinuationPromptStatus,
): ContinuationLatestEvent {
	const event: ContinuationLatestEvent = {
		id: nextEventId(store),
		source,
		status: "running",
		startedAt: nowMs(),
		trigger,
		artifactStatus: "pending",
		promptStatus,
		documentSync: defaultDocumentSync(),
	};
	store.latestEvent = event;
	store.activeEventId = event.id;
	return event;
}

/** Record a terminal blocked event without replacing an active running event. */
export function recordBlockedContinuationEvent(
	store: ContinuationEventStore,
	source: ContinuationEventSource,
	trigger: MidRunGuardTrigger | undefined,
	reason: string,
): ContinuationLatestEvent | undefined {
	if (store.activeEventId) return undefined;
	const timestamp = nowMs();
	const event: ContinuationLatestEvent = {
		id: nextEventId(store),
		source,
		status: "blocked",
		startedAt: timestamp,
		completedAt: timestamp,
		trigger,
		artifactStatus: "pending",
		promptStatus: "not-requested",
		documentSync: defaultDocumentSync(),
		failureReason: sanitizeEventReason(reason),
	};
	store.latestEvent = event;
	return event;
}

/** Return the currently active continuation event id for post-compaction side effects. */
export function getActiveContinuationEventId(store: ContinuationEventStore): string | undefined {
	return store.activeEventId;
}

/** Record whether the active continuation produced a modeled ledger, fallback, or abort. */
export function markActiveContinuationArtifact(
	store: ContinuationEventStore,
	status: ContinuationArtifactStatus,
	reason: string | undefined,
): void {
	const event = activeLatest(store);
	if (!event) return;
	replaceLatest(store, {
		...event,
		artifactStatus: status,
		failureReason: reason ? sanitizeEventReason(reason) : event.failureReason,
	});
}

/** Record planned document-sync outcomes before Pi saves the compaction entry. */
export function planActiveDocumentSync(
	store: ContinuationEventStore,
	documentSync: ContinuationDocumentSyncStatus,
): void {
	const event = activeLatest(store);
	if (!event) return;
	replaceLatest(store, {
		...event,
		documentSync,
	});
}

function updateDocumentTarget(
	current: ContinuationDocumentSyncStatus,
	target: ContinuationDocumentSyncTarget,
	status: ContinuationSyncStatus,
): ContinuationDocumentSyncStatus {
	if (target === "continuation-doc") return { ...current, continuationDoc: status };
	return { ...current, agentGuide: status };
}

/** Apply a post-compaction document-sync result only to the matching latest event id. */
export function recordDocumentSyncResult(
	store: ContinuationEventStore,
	eventId: string | undefined,
	target: ContinuationDocumentSyncTarget,
	status: ContinuationSyncStatus,
	reason: string | undefined,
): void {
	const event = latestMatching(store, eventId);
	if (!event) return;
	replaceLatest(store, {
		...event,
		documentSync: updateDocumentTarget(event.documentSync, target, status),
		failureReason: status === "failed" && reason ? sanitizeEventReason(reason) : event.failureReason,
	});
}

/** Mark same-session continuation prompt dispatch after the prompt sender succeeds. */
export function markContinuationPromptSent(store: ContinuationEventStore, eventId: string): void {
	const event = latestMatching(store, eventId);
	if (!event) return;
	replaceLatest(store, {
		...event,
		promptStatus: "sent",
	});
}

/** Settle a running latest-event snapshot with a terminal compaction outcome. */
export function finishContinuationEvent(
	store: ContinuationEventStore,
	eventId: string,
	status: Extract<ContinuationEventStatus, "completed" | "failed">,
	reason: string | undefined,
): boolean {
	const event = latestMatching(store, eventId);
	if (!event || store.activeEventId !== eventId || event.status !== "running") return false;
	replaceLatest(store, {
		...event,
		status,
		completedAt: nowMs(),
		promptStatus: terminalPromptStatus(event, status),
		failureReason: reason ? sanitizeEventReason(reason) : event.failureReason,
	});
	store.activeEventId = undefined;
	return true;
}

function terminalPromptStatus(event: ContinuationLatestEvent, status: Extract<ContinuationEventStatus, "completed" | "failed">): ContinuationPromptStatus {
	if (status === "failed" && event.promptStatus === "pending") return "failed";
	return event.promptStatus;
}

function failPendingDocumentSync(documentSync: ContinuationDocumentSyncStatus): ContinuationDocumentSyncStatus {
	return {
		continuationDoc: documentSync.continuationDoc === "pending" ? "failed" : documentSync.continuationDoc,
		agentGuide: documentSync.agentGuide === "pending" ? "failed" : documentSync.agentGuide,
	};
}

/** Mark pending document-sync outcomes for an event as failed without changing terminal compaction status. */
export function failPendingDocumentSyncForEvent(store: ContinuationEventStore, eventId: string | undefined, reason: string): void {
	const event = latestMatching(store, eventId);
	if (!event) return;
	replaceLatest(store, {
		...event,
		documentSync: failPendingDocumentSync(event.documentSync),
		failureReason: sanitizeEventReason(reason),
	});
}

/** Settle active or pending latest-event state when shutdown abandons continuation side effects. */
export function abandonActiveContinuationEvent(store: ContinuationEventStore, reason: string): void {
	const event = activeLatest(store) ?? store.latestEvent;
	if (!event) return;
	const hasPendingSync = event.documentSync.continuationDoc === "pending" || event.documentSync.agentGuide === "pending";
	const activeOrRunning = store.activeEventId === event.id || event.status === "running";
	if (!activeOrRunning && !hasPendingSync) return;
	replaceLatest(store, {
		...event,
		status: activeOrRunning ? "failed" : event.status,
		completedAt: event.completedAt ?? nowMs(),
		promptStatus: activeOrRunning && event.promptStatus === "pending" ? "failed" : event.promptStatus,
		documentSync: failPendingDocumentSync(event.documentSync),
		failureReason: sanitizeEventReason(reason),
	});
	if (store.activeEventId === event.id) store.activeEventId = undefined;
}
