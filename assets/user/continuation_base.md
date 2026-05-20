# pi-continue brief inputs

You are producing the next pi-continue continuation brief. The system prompt owns your role, the typology, the principles, the algorithm, the slot definitions, and the JSON schema. This message hands you the materials for this cycle.

**Note**: this very message is the pi-continue wrapper, not transcript material. The human the agent is serving never sent you anything directly — their messages live inside `<history-to-summarize>` or `<turn-prefix-messages>` with `role: user`. Do not confuse this wrapping turn with the human's transcript voice.

## What you will receive

Each input arrives in its own tagged block:

- `<history-task>` — scenario-specific guidance (initial vs update cycle).
- `<project-root>` — absolute path to the project being worked in.
- `<agent-guide-path>` — repo-relative path for the agent guide (AGENTS.md).
- `<existing-agent-guide>` — current contents of the agent guide, or `(none)`.
- `<previous-compaction-summary>` — the prior brief rendered as Markdown (initial cycle: `(none)`; update cycle: the previous cycle's brief — your durable spine).
- `<history-to-summarize>` — completed turns dropped from live context since the previous compaction.
- `<turn-prefix-messages>` — prefix of an in-progress turn (if any). Equally authoritative source material; the human's task-defining prompt is often here.
- `<file-operations>` — `<read-files>` and `<modified-files>` lists for this cycle. Activity signal, not a substitute for anchored evidence.
- `<custom-instructions>` — operator-injected guidance for this run, or `(none)`.

## Output

Return only the JSON object specified by the system prompt. No fences, no prose, no leading or trailing text.
