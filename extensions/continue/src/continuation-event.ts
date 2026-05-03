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
	ContinuationSynthesisFailure,
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

function defaultCompactionProof() {
	return { status: "pending" as const };
}

function latestMatching(store: ContinuationEventStore, eventId: string | undefined): ContinuationLatestEvent | undefined {
	if (!eventId || !store.latestEvent || store.latestEvent.id !== eventId) return undefined;
	return store.latestEvent;
}

/** Return whether an event id still owns the latest continuation snapshot. */
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
		compactionProof: defaultCompactionProof(),
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
		compactionProof: { status: "failed", failureReason: reason },
		promptStatus: "not-requested",
		documentSync: defaultDocumentSync(),
		resume: defaultResume(),
		failureReason: reason,
	};
	store.latestEvent = event;
	return event;
}

/** Return the currently active continuation event id for post-compaction side effects. */
export function getActiveContinuationEventId(store: ContinuationEventStore): string | undefined {
	return store.activeEventId;
}

/** Record whether the active continuation produced a modeled ledger or aborted before a usable artifact. */
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
		failureReason: reason ?? event.failureReason,
	});
}

/** Record a bounded synthesis failure classifier without storing provider output. */
export function recordActiveSynthesisFailure(store: ContinuationEventStore, failure: ContinuationSynthesisFailure): void {
	const event = activeLatest(store);
	if (!event) return;
	replaceLatest(store, {
		...event,
		synthesisFailure: failure,
	});
}

/** Mark that Pi saved and reported the matching package-owned compaction entry. */
export function markContinuationCompactionProofVerified(store: ContinuationEventStore, eventId: string, compactionEntryId: string): boolean {
	const event = latestMatching(store, eventId);
	if (!event || store.activeEventId !== eventId || event.status !== "running") return false;
	replaceLatest(store, {
		...event,
		compactionProof: {
			status: "verified",
			compactionEntryId,
			verifiedAt: nowMs(),
		},
	});
	return true;
}

/** Mark that Pi did not report a valid package-owned compaction entry for the active continuation. */
export function markContinuationCompactionProofFailed(store: ContinuationEventStore, eventId: string, reason: string): boolean {
	const event = latestMatching(store, eventId);
	if (!event || store.activeEventId !== eventId || event.status !== "running") return false;
	replaceLatest(store, {
		...event,
		compactionProof: {
			status: "failed",
			failureReason: reason,
		},
		failureReason: reason,
	});
	return true;
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
		failureReason: status === "failed" && reason ? reason : event.failureReason,
	});
}

/** Mark that a same-session resume request is about to be dispatched. */
export function markContinuationResumePending(store: ContinuationEventStore, eventId: string): void {
	const event = latestMatching(store, eventId);
	if (!event || store.activeEventId !== eventId || event.status !== "running") return;
	if (event.resume.status !== "not-requested") return;
	replaceLatest(store, {
		...event,
		resume: { status: "pending" },
	});
}

/** Mark same-session continuation prompt dispatch after the prompt sender succeeds. */
export function markContinuationPromptSent(store: ContinuationEventStore, eventId: string): void {
	const event = latestMatching(store, eventId);
	if (!event || store.activeEventId !== eventId || event.status !== "running") return;
	replaceLatest(store, {
		...event,
		promptStatus: "sent",
		resume: event.resume.status === "not-requested" ? { status: "pending" } : event.resume,
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

function terminalCompactionProof(
	event: ContinuationLatestEvent,
	status: Extract<ContinuationEventStatus, "completed" | "failed">,
	reason: string | undefined,
): ContinuationLatestEvent["compactionProof"] {
	if (status === "failed" && event.compactionProof.status === "pending") {
		return { status: "failed", failureReason: reason };
	}
	return event.compactionProof;
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
		failureReason: reason ?? event.resume.failureReason,
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
		compactionProof: terminalCompactionProof(event, status, reason),
		promptStatus: terminalPromptStatus(event, status),
		resume: terminalResumeOutcome(event, status, reason),
		failureReason: reason ?? event.failureReason,
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
	const failureReason = options.failureReason;
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
			failureReason,
		},
		failureReason: failureReason ?? event.failureReason,
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
		failureReason: reason,
	});
}

function abandonedResume(event: ContinuationLatestEvent, reason: string): ContinuationResumeOutcome {
	if (event.resume.status !== "pending" && event.resume.status !== "running") return event.resume;
	return {
		...event.resume,
		status: "failed",
		completedAt: event.resume.completedAt ?? nowMs(),
		failureReason: reason,
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
		failureReason: reason,
	});
	if (store.activeEventId === event.id) store.activeEventId = undefined;
}
