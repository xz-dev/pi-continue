import test from "node:test";
import assert from "node:assert/strict";
import { buildContinuationDetails, buildContinuationSynthesisTelemetry, parseContinuationDetails, renderContinuationDetails } from "../extensions/continue/src/details.ts";

test("buildContinuationDetails records current file operations only", () => {
	const details = buildContinuationDetails(
		{
			read: new Set(["/repo/a.ts", "/repo/b.ts"]),
			written: new Set<string>(),
			edited: new Set(["/repo/b.ts", "/repo/c.ts"]),
		},
		"sync-1",
		"guide-1",
		"replacement-pending",
		"capture corrected command truth",
		{
			history: {
				requestedModel: "openai/gpt-test",
				responseModel: "openai/gpt-routed",
				responseId: "resp-1",
				usage: { input: 10, output: 20, cacheRead: 0, cacheWrite: 0, totalTokens: 30, costTotal: 0.001 },
				httpStatus: 200,
			},
			totalCost: 0.001,
			totalTokens: 30,
		},
		"continue-1",
	);
	assert.deepEqual(details.readFiles, ["/repo/a.ts"]);
	assert.deepEqual(details.modifiedFiles, ["/repo/b.ts", "/repo/c.ts"]);
	assert.equal(details.documentSyncId, "sync-1");
	assert.equal(details.agentGuideSyncId, "guide-1");
	assert.equal(details.agentGuideWriteStatus, "replacement-pending");
	assert.equal(details.agentGuideChangeReason, "capture corrected command truth");
	assert.equal(details.continuationEventId, "continue-1");
	assert.equal(details.synthesis?.history?.requestedModel, "openai/gpt-test");
	assert.equal(details.synthesis?.history?.responseModel, "openai/gpt-routed");
	assert.equal(details.synthesis?.history?.httpStatus, 200);
	assert.equal(details.synthesis?.totalTokens, 30);
});

test("buildContinuationSynthesisTelemetry stores only allowlisted telemetry", () => {
	const history = {
		requestedModel: "openai/gpt-test",
		responseModel: "openai/gpt-routed",
		responseId: "resp-1",
		usage: { input: 10, output: 20, cacheRead: 1, cacheWrite: 2, totalTokens: 33, costTotal: 0.001 },
		httpStatus: 200,
		text: "SECRET RAW MODEL ARTIFACT",
	};
	const synthesis = buildContinuationSynthesisTelemetry(history, undefined);
	assert.ok(synthesis?.history);
	assert.equal("text" in synthesis.history, false);
	assert.deepEqual(synthesis.history.usage, { input: 10, output: 20, cacheRead: 1, cacheWrite: 2, totalTokens: 33, costTotal: 0.001 });
	assert.equal(synthesis.totalTokens, 33);
});

test("parseContinuationDetails reads the full session details payload", () => {
	const parsed = parseContinuationDetails({
		kind: "pi-continue/v2",
		readFiles: ["/repo/read.ts"],
		modifiedFiles: ["/repo/write.ts"],
		documentSyncId: "sync-2",
		agentGuideSyncId: "guide-2",
		agentGuideWriteStatus: "no-replacement",
		agentGuideChangeReason: "No durable guide change is warranted.",
		continuationEventId: "continue-2",
	});
	assert.deepEqual(parsed, {
		kind: "pi-continue/v2",
		readFiles: ["/repo/read.ts"],
		modifiedFiles: ["/repo/write.ts"],
		documentSyncId: "sync-2",
		agentGuideSyncId: "guide-2",
		agentGuideWriteStatus: "no-replacement",
		agentGuideChangeReason: "No durable guide change is warranted.",
		continuationEventId: "continue-2",
	});
});

test("renderContinuationDetails writes compact metadata without file paths", () => {
	const rendered = renderContinuationDetails({
		kind: "pi-continue/v3",
		readFiles: ["/repo/read.ts"],
		modifiedFiles: ["/repo/write.ts"],
		documentSyncId: "sync-3",
		agentGuideSyncId: "guide-3",
		agentGuideWriteStatus: "replacement-pending",
		agentGuideChangeReason: "capture durable operating rule",
		continuationEventId: "continue-3",
	});
	assert.match(rendered, /<continuation-compaction-details>/);
	assert.match(rendered, /"kind": "pi-continue\/v3"/);
	assert.match(rendered, /"readFileCount": 1/);
	assert.match(rendered, /"modifiedFileCount": 1/);
	assert.match(rendered, /"documentSyncId": "sync-3"/);
	assert.match(rendered, /"agentGuideSyncId": "guide-3"/);
	assert.match(rendered, /"agentGuideWriteStatus": "replacement-pending"/);
	assert.match(rendered, /"agentGuideChangeReason": "capture durable operating rule"/);
	assert.match(rendered, /"continuationEventId": "continue-3"/);
	assert.doesNotMatch(rendered, /\/repo\/read\.ts/);
	assert.doesNotMatch(rendered, /\/repo\/write\.ts/);
});
