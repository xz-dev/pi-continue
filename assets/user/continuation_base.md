# Continuation artifact quality bar

Write continuation artifacts for the next Pi turn after compaction.

## Objective

- Preserve what still changes what the next agent should do, avoid, ask, validate, inspect, update durably, or remember as reusable operating guidance.
- Before synthesizing conclusions, account for every tool output and every user and assistant message in the supplied context.
- Treat transcript and tool history as noisy evidence, not as content to replay.
- Apply the Evidence Gate: keep a detail only when it changes continuation behavior, prevents a wrong action, proves current state, records a blocker, encodes an explicit or repeated user requirement, or captures durable learning that should survive compaction.
- Use only supplied context and explicit runtime sections; do not invent missing progress, validation, file contents, AGENTS.md changes, or root cause.
- Synthesize everything that still applies into the structured JSON fields requested by the system prompt.
- Make the artifacts cohesive: the brief, document, and agent-guide candidate should use the same facts, vocabulary, constraints, and current truth.
- Include enduring requirements: absolute constraints, evergreen preferences, stable context, reusable user feedback, and relevant lasting learning.
- Convert repeated friction into one durable rule; do not list each occurrence.
- Remove transient details, contradictions, duplication, and stale assumptions.
- Preserve intent, philosophy, standards, desired outcomes, repeated points of attention, and friction that still matters.
- Ensure the result is internally consistent, contradiction-free, and immediately actionable.

## Artifact shape guidance

Use the structured fields as semantic slots, not as a transcript template:

- `task`: active goal, success condition, and product/user intent.
- `state`: what is true now and proven.
- `decisions`: constraints, approvals, rejected weak paths, and canonical ownership choices.
- `contextMap`: curated sources to consult, with rationale and use. This is the replacement for fixed read lists.
- `workingEdge`: current execution edge, plausible next route, and sequencing constraints. This is not a single mandatory "do now" line.
- `validation`: proof already obtained, stale checks, deferred checks, failures, and remaining gates.
- `risks`: blockers, ambiguities, assumptions, and hazards.
- `antiRework`: completed discovery, false starts, and duplication traps.
- `durableLearnings`: generalizable rules from user feedback, friction, mistakes, or successful patterns.
- `agentGuideUpdates`: candidate guide changes or explicit reasons not to update the guide.

## Curation doctrine

- Do not impose or mention a numeric quota for sources, files, actions, or bullets.
- Include a source only when it changes likely action, prevents a mistake, or unlocks a decision.
- Exclude files that were merely read, merely touched, or only useful as provenance.
- Include modified files when inspection is safety-critical before future edits or validation.
- Keep commands exact when they are the next falsifiable check or the proven canonical gate.
- Mark stale validation as stale; do not promote it to current proof.

## AGENTS.md candidate policy

- Use `agentGuideMarkdown` only for durable operating guidance: user preferences, corrected command truth, stable boundaries, reusable procedures, or repo rules that should govern future agents.
- If a learning belongs only to the active task, keep it in the continuation artifacts and set `agentGuideMarkdown` to null.
- If a guide update is warranted, emit the full replacement guide content and explain the reason in `agentGuideChangeReason`.
- Do not claim the guide was written unless the supplied context proves it.

## Style

- Prefer strong nouns and verbs over connective prose.
- Merge duplicates into one sharper line.
- Keep exact wording only when precision matters.
- Do not present inference as fact.
- Keep the brief tactical; keep the document durable.
- Favor GPT-5-class outcome-first directness over process-heavy prompting.

## Output

- Return only the strict JSON artifact object requested by the system prompt.
- Fill every required structured field with an array, using an empty array only when no item passes the Evidence Gate.
- Put a full AGENTS.md replacement in `agentGuideMarkdown` only when warranted; otherwise use null.

## Quality bar

The continuation turn should be able to read the structured summary and optional repo documents, then continue correctly without rereading the past.
