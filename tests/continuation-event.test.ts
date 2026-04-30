import test from "node:test";
import assert from "node:assert/strict";
import {
	abandonActiveContinuationEvent,
	beginContinuationEvent,
	failPendingDocumentSyncForEvent,
	finishContinuationEvent,
	isLatestContinuationEvent,
	planActiveDocumentSync,
	recordDocumentSyncResult,
	sanitizeEventReason,
} from "../extensions/continue/src/continuation-event.ts";
import type { ContinuationEventStore } from "../extensions/continue/src/types.ts";

function createStore(): ContinuationEventStore {
	return {
		latestEvent: undefined,
		activeEventId: undefined,
		nextEventSequence: 0,
	};
}

test("sanitizeEventReason returns allowlisted copy instead of raw sensitive text", () => {
	const provider = sanitizeEventReason(
		"Provider 400 echoed prompt <history-to-summarize>secret work</history-to-summarize> OPENAI_API_KEY=secretvalue",
	);
	assert.equal(provider, "Summarizer provider failed; check model, authentication, or context settings.");
	assert.doesNotMatch(provider, /secret|OPENAI|history-to-summarize/);
	const document = sanitizeEventReason("EACCES: permission denied, open '/Users/alice/private/repo/CONTINUE.md'");
	assert.equal(document, "Document sync failed; check the configured path and permissions.");
	assert.doesNotMatch(document, /Users|alice|CONTINUE/);
});

test("document sync updates require the matching latest event id", () => {
	const store = createStore();
	const event = beginContinuationEvent(store, "command-steer", undefined, "pending");
	finishContinuationEvent(store, event.id, "completed", undefined);
	recordDocumentSyncResult(store, "stale-event", "continuation-doc", "failed", "stale failure");
	assert.equal(isLatestContinuationEvent(store, "stale-event"), false);
	assert.equal(store.latestEvent?.documentSync.continuationDoc, "off");
	assert.equal(store.latestEvent?.failureReason, undefined);
	recordDocumentSyncResult(store, event.id, "continuation-doc", "updated", undefined);
	assert.equal(store.latestEvent?.documentSync.continuationDoc, "updated");
});

test("abandonActiveContinuationEvent settles pending sync on shutdown", () => {
	const store = createStore();
	beginContinuationEvent(store, "command-queue", undefined, "pending");
	planActiveDocumentSync(store, {
		continuationDoc: "pending",
		agentGuide: "pending",
	});
	abandonActiveContinuationEvent(store, "shutdown token=secretvalue");
	assert.equal(store.activeEventId, undefined);
	assert.equal(store.latestEvent?.status, "failed");
	assert.equal(store.latestEvent?.documentSync.continuationDoc, "failed");
	assert.equal(store.latestEvent?.documentSync.agentGuide, "failed");
	assert.equal(store.latestEvent?.failureReason, "Pi session shut down before continuation aftercare settled.");
});

test("abandonActiveContinuationEvent fails pending sync after compaction completion", () => {
	const store = createStore();
	const event = beginContinuationEvent(store, "command-queue", undefined, "pending");
	planActiveDocumentSync(store, {
		continuationDoc: "pending",
		agentGuide: "off",
	});
	finishContinuationEvent(store, event.id, "completed", undefined);
	abandonActiveContinuationEvent(store, "shutdown token=secretvalue");
	assert.equal(store.activeEventId, undefined);
	assert.equal(store.latestEvent?.status, "completed");
	assert.equal(store.latestEvent?.documentSync.continuationDoc, "failed");
	assert.equal(store.latestEvent?.documentSync.agentGuide, "off");
	assert.equal(store.latestEvent?.failureReason, "Pi session shut down before continuation aftercare settled.");
});

test("finishContinuationEvent is terminal-idempotent", () => {
	const store = createStore();
	const event = beginContinuationEvent(store, "mid-run-guard", undefined, "pending");
	assert.equal(finishContinuationEvent(store, event.id, "failed", "provider 500"), true);
	assert.equal(finishContinuationEvent(store, event.id, "completed", undefined), false);
	assert.equal(store.latestEvent?.status, "failed");
	assert.equal(store.latestEvent?.failureReason, "Summarizer provider failed; check model, authentication, or context settings.");
});

test("failPendingDocumentSyncForEvent clears pending sync without raw details", () => {
	const store = createStore();
	const event = beginContinuationEvent(store, "command-steer", undefined, "pending");
	planActiveDocumentSync(store, {
		continuationDoc: "pending",
		agentGuide: "no-replacement",
	});
	failPendingDocumentSyncForEvent(store, event.id, "EACCES: /Users/alice/repo/CONTINUE.md");
	assert.equal(store.latestEvent?.documentSync.continuationDoc, "failed");
	assert.equal(store.latestEvent?.documentSync.agentGuide, "no-replacement");
	assert.equal(store.latestEvent?.failureReason, "Document sync failed; check the configured path and permissions.");
});
