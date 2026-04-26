import test from "node:test";
import assert from "node:assert/strict";
import { getContinueArgumentCompletions } from "../extensions/continue/src/completions.ts";

test("getContinueArgumentCompletions exposes action-first top-level shortcuts", () => {
	const items = getContinueArgumentCompletions("");
	assert.ok(items);
	assert.deepEqual(items.map((item) => item.value), ["steer", "queue", "status", "settings", "reset", "preview"]);
	assert.match(items[0].description ?? "", /Continue now/);
	assert.match(items[1].description ?? "", /Queue until idle/);
});

test("getContinueArgumentCompletions filters top-level shortcuts", () => {
	assert.deepEqual(getContinueArgumentCompletions("st")?.map((item) => item.value), ["steer", "status"]);
	assert.deepEqual(getContinueArgumentCompletions("pre")?.map((item) => item.value), ["preview"]);
	assert.equal(getContinueArgumentCompletions("unknown"), null);
});

test("getContinueArgumentCompletions completes settings and reset scopes", () => {
	assert.deepEqual(getContinueArgumentCompletions("settings ")?.map((item) => item.value), ["settings project", "settings global"]);
	assert.deepEqual(getContinueArgumentCompletions("settings g")?.map((item) => item.value), ["settings global"]);
	assert.deepEqual(getContinueArgumentCompletions("reset p")?.map((item) => item.value), ["reset project"]);
	assert.equal(getContinueArgumentCompletions("preview focus"), null);
});
