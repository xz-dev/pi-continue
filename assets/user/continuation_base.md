# Literal `<continuation>` contract

Continuation to another agent in a new session, now.

## OBJECTIVE

Write a faithful continuation note for another agent that will need to pick up from here.

- Preserve what still changes what the next agent should do, avoid, ask, validate, or read.
- Before synthesizing conclusions, read every tool output and every user and assistant message in your context.
- Treat transcript and tool history as noisy evidence, not as content to replay.
- Apply an Evidence Gate: keep a detail only when it changes continuation behavior, prevents a wrong action, proves current state, records a blocker, or encodes an explicit/repeated user requirement.
- Read and research any additional material needed to build a grounded, correct picture.
- Synthesize everything that still applies into one clean, cohesive prompt that another agent can execute immediately.
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

- Emit the note as instructions to send to the new agent.
- Use these headings and never omit `## Must Read` or `## Start From Here`.
- Update `CONTINUE.md` accordingly.

## QUALITY BAR

The new agent should be able to read the note and `CONTINUE.md` and continue correctly without rereading the past.
