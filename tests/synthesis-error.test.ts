import test from "node:test";
import assert from "node:assert/strict";
import { buildSynthesisAbortError, SYNTHESIS_ABORT_MESSAGE } from "../extensions/continue/src/synthesis-error.ts";

test("buildSynthesisAbortError uses the fixed hard-fail message", () => {
	const error = buildSynthesisAbortError();
	assert.equal(error.message, SYNTHESIS_ABORT_MESSAGE);
});
