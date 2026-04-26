# Literal `<continuation>` contract

Continuation for the next Pi turn after compaction, now.

## OBJECTIVE

Write a faithful continuation note for the agent turn that will pick up from here.

- Preserve what still changes what the next agent should do, avoid, ask, validate, or read.
- Before synthesizing conclusions, account for every tool output and every user and assistant message in your supplied context.
- Treat transcript and tool history as noisy evidence, not as content to replay.
- Apply an Evidence Gate: keep a detail only when it changes continuation behavior, prevents a wrong action, proves current state, records a blocker, or encodes an explicit/repeated user requirement.
- Use only supplied context and explicit runtime sections; do not invent missing progress, validation, or root cause.
- Synthesize everything that still applies into one clean, cohesive prompt that the continuation turn can execute immediately.
- Include `## Must Read`: at most five exact paths/resources the next agent should read first, each with a short note on why it matters and what decision or action it unlocks.
- Include `## Start From Here`: the first concrete next action, command, edit, or investigation step.
- Treat `## Must Read` as a curated route, not a file-operation log. Prefer fewer, higher-signal entries. Do not include files merely because they were read or modified.
- Include enduring requirements: absolute constraints, evergreen preferences, stable context, and **relevant lasting learning**.
- Convert repeated friction into one durable rule; do not list each occurrence.
- Remove transient details, contradictions, duplication, and stale assumptions.
- Preserve intent, philosophy, standards, desired outcomes, and **repeated points of attention and friction**.
- Ensure the result is internally consistent, contradiction-free, and immediately actionable.

## STYLE

- Prefer strong nouns and verbs over connective prose.
- Merge duplicates into one sharper line.
- Keep exact wording only when precision matters.
- Do not present inference as fact.

## OUTPUT

- Emit the note as instructions for the continuation turn.
- Use these headings and never omit `## Must Read` or `## Start From Here`.
- Update the `<continuation-md>` artifact accordingly.

## QUALITY BAR

The continuation turn should be able to read the note and optional continuation document and continue correctly without rereading the past.
