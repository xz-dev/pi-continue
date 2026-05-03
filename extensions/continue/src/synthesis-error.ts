export const SYNTHESIS_ABORT_MESSAGE = "pi-continue could not create a usable handoff, so continuation stopped before resuming.";

/** Build the error used when modeled continuation ledger synthesis cannot produce a usable artifact. */
export function buildSynthesisAbortError(): Error {
	return new Error(SYNTHESIS_ABORT_MESSAGE);
}
