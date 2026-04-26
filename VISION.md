# Vision

`pi-continue` exists so Pi can keep working when context fills up in the middle of a run.

## Product promise

A long Pi task should not require babysitting just because context pressure appears while Pi is still using tools. When the session crosses the compaction threshold at a safe checkpoint, Pi should compact, preserve what matters, and continue the same task from the new summary.

## User problem

Long tool-heavy runs can grow context between normal auto-compaction checkpoints. The user sees failures such as oversized requests, `context_length_exceeded`, awkward retries, or a stopped run even though the work itself was progressing.

`pi-continue` treats that as a continuation problem, not a memory problem or a replacement-compaction problem.

## Product principles

- Continue in the same Pi session.
- Use Pi's native compaction pipeline and session format.
- Act only at safe mid-run checkpoints after complete tool-result batches.
- Never interrupt running tools or incomplete assistant/tool-result pairs.
- Make continuation actionable through structured task, state, decisions, context-map, working-edge, validation, risk, anti-rework, durable-learning, and agent-guide-update fields.
- Trust model judgment for curated reading routes; do not impose arbitrary numeric caps in prompts or code.
- Treat transcript, tool output, file lists, and logs as evidence, not material to replay.
- Preserve durable user feedback and repeated operational learning instead of dropping it because a subtask ended.
- Keep AGENTS.md refinement explicit and configurable, with side-effect writes off by default.
- Keep prompt behavior customizable through system and user prompt assets.
- Keep threshold ownership with Pi core settings instead of adding a competing percentage knob.
- Prefer a small, auditable extension over a memory system, context pruner, session fork, or Pi patch.

## Success criteria

- Pi avoids sending another over-threshold provider request when an extension-visible safe checkpoint exists.
- The next turn continues the user's active task without redoing completed discovery.
- Continuation summaries are evidence-gated, structured, and immediately actionable.
- Read routes are high-signal and justified by action/risk, not capped by arbitrary counts or expanded from raw file activity.
- Durable learnings appear in continuation artifacts, and reusable operating-rule updates can be promoted to the configured agent guide when explicitly enabled.
- Operators can discover continuation actions from exact `/continue`, add optional focus through a separate prompt, and still rely on typed shortcuts with autocomplete.
- Operators can inspect config, prompt provenance, and the exact prompt payloads used for continuation.
- Public docs, examples, prompt assets, tests, and package metadata describe one coherent product contract.

## Non-goals

- No Pi vendor-code patches.
- No session fork, switch, or transcript rewrite.
- No interruption of incomplete tool-call batches.
- No synthetic tool results or invented model output.
- No general-purpose memory, context-pruning, or custom-compaction framework.
- No top-level command aliases.
- No AGENTS.md or continuation-document writes unless the matching sync mode is explicitly enabled.
