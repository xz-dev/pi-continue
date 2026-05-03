/** Same-session resume prompt sent after package-owned handoff compaction completes. */
export const CONTINUATION_PROMPT = [
	"Continue from the same-session pi-continue/v3 handoff Pi just saved.",
	"Use the package-owned compaction summary as the primary Continuation Ledger.",
	"Do not treat native fallback summaries, session forks, or transcript replay as a valid continuation handoff.",
	"Use the ledger to identify the active request, current state, constraints, validation, risks, durable learnings, and next working edge before broader discovery.",
	"Honor the recency ledger first: newer active user requests and supersession resolutions override older plan or await-direction state.",
	"Resolve relevant non-none durable promotions before editing their target surfaces, unless newer evidence rejects or defers them.",
	"Read repo documents or mapped sources only when the ledger says they unlock a decision, prevent rework, or reduce risk.",
	"Treat configured agent-guide candidate updates as guidance unless the ledger says they were written; candidate notes alone are not writes.",
	"Treat transcript and tool history as evidence, not replay.",
	"Do not redo completed discovery or revive retired facts.",
	"Continue the user's active task from the live working edge while preserving all constraints, decisions, completion criteria, and durable learnings captured in the Continuation Ledger.",
].join(" ");
