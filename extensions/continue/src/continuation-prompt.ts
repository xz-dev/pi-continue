/** Same-session resume prompt sent after package-owned compaction completes. */
export const CONTINUATION_PROMPT = [
	"Continue from the continuation compaction that was just created.",
	"Use the compaction summary as the primary continuation ledger.",
	"Orient from its task, initiative charter, definition of done, recency ledger, current plan, progress trail, current state, decisions, context map, working edge, validation, risks, dormant context, retired context, anti-rework, durable learnings, durable promotions, and agent-guide update notes before broader discovery.",
	"Honor the recency ledger first: newer active user requests and supersession resolutions override older plan or await-direction state.",
	"Resolve every non-none durable promotion through normal repo work before further mutation in the affected repo, unless newer evidence rejects or defers it.",
	"Read repo documents or mapped sources only when the ledger says they unlock a decision, prevent rework, or reduce risk.",
	"Treat AGENTS.md candidate updates as guidance unless the ledger says they were written; candidate notes alone are not writes.",
	"Treat transcript and tool history as evidence, not replay.",
	"Do not redo completed discovery or revive retired facts.",
	"Continue the user's active task from the live working edge while preserving all constraints, decisions, completion criteria, and durable learnings captured in the continuation ledger.",
].join(" ");
