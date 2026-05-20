/** Same-session resume prompt sent after package-owned handoff compaction completes. */
export const CONTINUATION_PROMPT = [
	"You are continuing the same work after an automatic context compaction.",
	"Your prior cycles are gone; the brief above is your full working memory, written by you in your prior synthesizer pass as durable tattoos meant to survive that amnesia — treat it as authoritative and ignore any other summary or fallback that may also appear in this turn.",
	"brief.established holds anchored claims you already proved (trust them; do not re-verify);",
	"brief.learned holds insights you derived during this session (apply them);",
	"brief.forbid lists constraints you locked yourself into;",
	"brief.open lists questions paired with what would close each;",
	"brief.next[0] is your queued immediate resume action — execute it.",
	"brief.task and brief.done_when define when you stop.",
].join(" ");
