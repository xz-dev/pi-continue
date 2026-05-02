export const SYNTHESIS_ABORT_MESSAGE = "Continuation artifact synthesis failed; compaction was aborted before a usable ledger was saved.";

/** Build the error used when modeled continuation ledger synthesis cannot produce a usable artifact. */
export function buildSynthesisAbortError(): Error {
	return new Error(SYNTHESIS_ABORT_MESSAGE);
}
