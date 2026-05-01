import type {
	ContinuationArtifactStatus,
	ContinuationDocumentSyncStatus,
	ContinuationDocumentSyncTarget,
	ContinuationEventSource,
	ContinuationEventStore,
	ContinuationEventStatus,
	ContinuationLatestEvent,
	ContinuationPromptStatus,
	ContinuationResumeOutcome,
	ContinuationResumeStatus,
	ContinuationSynthesisTelemetry,
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

function defaultResume(): ContinuationResumeOutcome {
	return { status: "not-requested" };
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
	if (compact.includes("resume") && (compact.includes("abort") || compact.includes("cancel"))) {
		return "Continuation resume was aborted.";
	}
	if (compact.includes("resume") && (compact.includes("length") || compact.includes("limit") || compact.includes("context"))) {
		return "Continuation resume stopped before completing because a model limit was reached.";
	}
	if (compact.includes("resume") && compact.includes("assistant")) {
		return "Continuation resume did not produce an assistant response.";
	}
	if (compact.includes("prompt") && (compact.includes("send") || compact.includes("dispatch") || compact.includes("handled"))) {
		return "Continuation prompt dispatch failed.";
	}
	if (compact.includes("ledger") && compact.includes("overlay") && compact.includes("unavailable")) {
		return "Continuation Ledger overlay is unavailable in this Pi mode.";
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
		resume: defaultResume(),
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
		resume: defaultResume(),
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

/** Record summarizer telemetry for the active continuation compaction. */
export function recordActiveSynthesisTelemetry(
	store: ContinuationEventStore,
	synthesis: ContinuationSynthesisTelemetry | undefined,
): void {
	if (!synthesis) return;
	const event = activeLatest(store);
	if (!event) return;
	replaceLatest(store, {
		...event,
		synthesis,
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
	if (!event || store.activeEventId !== eventId || event.status !== "running") return;
	replaceLatest(store, {
		...event,
		promptStatus: "sent",
		resume: { status: "pending" },
	});
}

/** Mark the extension-owned resumed turn as started. */
export function markContinuationResumeStarted(store: ContinuationEventStore, eventId: string | undefined): boolean {
	const event = latestMatching(store, eventId);
	if (!event || store.activeEventId !== eventId || event.status !== "running" || event.resume.status !== "pending") return false;
	replaceLatest(store, {
		...event,
		resume: {
			...event.resume,
			status: "running",
			startedAt: nowMs(),
		},
	});
	return true;
}

function terminalPromptStatus(event: ContinuationLatestEvent, status: Extract<ContinuationEventStatus, "completed" | "failed">): ContinuationPromptStatus {
	if (status === "failed" && event.promptStatus === "pending") return "failed";
	return event.promptStatus;
}

function terminalResumeOutcome(
	event: ContinuationLatestEvent,
	status: Extract<ContinuationEventStatus, "completed" | "failed">,
	reason: string | undefined,
): ContinuationResumeOutcome {
	if (event.resume.status === "not-requested") return event.resume;
	if (event.resume.status === "completed" || event.resume.status === "failed" || event.resume.status === "aborted") return event.resume;
	if (status === "completed") return event.resume;
	return {
		...event.resume,
		status: "failed",
		completedAt: nowMs(),
		failureReason: reason ? sanitizeEventReason(reason) : event.resume.failureReason,
	};
}

/** Settle a running latest-event snapshot with a terminal compaction or dispatch outcome. */
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
		resume: terminalResumeOutcome(event, status, reason),
		failureReason: reason ? sanitizeEventReason(reason) : event.failureReason,
	});
	store.activeEventId = undefined;
	return true;
}

/** Settle the resumed assistant turn for the matching active continuation. */
export function settleContinuationResume(
	store: ContinuationEventStore,
	eventId: string | undefined,
	status: Exclude<ContinuationResumeStatus, "not-requested" | "pending" | "running">,
	options: {
		stopReason?: string;
		requestedModel?: string;
		responseModel?: string;
		failureReason?: string;
	},
): boolean {
	const event = latestMatching(store, eventId);
	if (!event || store.activeEventId !== eventId || event.status !== "running") return false;
	if (event.resume.status !== "pending" && event.resume.status !== "running") return false;
	const safeReason = options.failureReason ? sanitizeEventReason(options.failureReason) : undefined;
	const terminalEventStatus: Extract<ContinuationEventStatus, "completed" | "failed"> = status === "completed" ? "completed" : "failed";
	replaceLatest(store, {
		...event,
		status: terminalEventStatus,
		completedAt: nowMs(),
		resume: {
			...event.resume,
			status,
			completedAt: nowMs(),
			stopReason: options.stopReason,
			requestedModel: options.requestedModel,
			responseModel: options.responseModel,
			failureReason: safeReason,
		},
		failureReason: safeReason ?? event.failureReason,
	});
	store.activeEventId = undefined;
	return true;
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

function abandonedResume(event: ContinuationLatestEvent, reason: string): ContinuationResumeOutcome {
	if (event.resume.status !== "pending" && event.resume.status !== "running") return event.resume;
	return {
		...event.resume,
		status: "failed",
		completedAt: event.resume.completedAt ?? nowMs(),
		failureReason: sanitizeEventReason(reason),
	};
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
		resume: abandonedResume(event, reason),
		failureReason: sanitizeEventReason(reason),
	});
	if (store.activeEventId === event.id) store.activeEventId = undefined;
}
