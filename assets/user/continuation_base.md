# Continuation ledger quality bar

Write continuation artifacts for the next Pi turn after compaction.

## Objective

- Preserve what still changes what the next agent should do, avoid, ask, validate, inspect, update durably, or remember as reusable operating guidance.
- Before synthesizing conclusions, account for every tool output and every user and assistant message in the supplied context.
- Treat transcript and tool history as noisy evidence, not as content to replay.
- Emit one current Pi Continuation Ledger in the strict JSON schema requested by the system prompt. This is a reducer, not a chronological summary or a stacked layer over a previous ledger.
- Preserve the initiative spine across compactions: durable purpose, why the user cares, definition of done, active request recency, plan of record, sticky constraints, durable decisions, dormant-but-important context, active risks, and rejected-path rationale.
- Apply the Evidence Gate: keep a detail only when it changes continuation behavior, prevents a wrong action, proves current state, records a blocker, encodes an explicit or repeated user requirement, or captures durable learning that should survive compaction.
- Use only supplied context and explicit runtime sections; do not invent missing progress, validation, file contents, AGENTS.md changes, control-plane writes, or root cause.
- Synthesize everything that still applies into the structured JSON fields requested by the system prompt.
- Make the artifacts cohesive: the brief, document, durable promotions, and agent-guide candidate should use the same facts, vocabulary, constraints, and current truth.
- Include enduring requirements: absolute constraints, evergreen preferences, stable context, reusable user feedback, and relevant lasting learning.
- Convert repeated friction into one durable rule; do not list each occurrence.
- Remove transient details, contradictions, duplication, and stale assumptions.
- Resolve recency conflicts explicitly: newer user requests, split-prefix facts, and live tool evidence supersede older summary plans when they conflict.
- Preserve intent, philosophy, standards, desired outcomes, repeated points of attention, and friction that still matters.
- Ensure the result is internally consistent, contradiction-free, and immediately actionable.

## Artifact shape guidance

Use the structured fields as semantic slots, not as a transcript template:

- `task`: active goal, success condition, and product/user intent.
- `initiativeCharter`: durable story spine: problem, why it matters, intended outcome, canonical strategy, non-goals, and must-not-forget context.
- `definitionOfDone`: completion criteria split by user-visible result, implementation, docs/control-plane, validation/proof, and explicit blockers.
- `recencyLedger`: active, amended, superseded, stale, confirmed, or unknown request/plan/validation resolution. It must contain at least one entry and make the newest active request and any misleading older plan explicit.
- `currentPlan`: active, pending, blocked, done, and rejected lanes when they affect future decisions.
- `progress`: milestone trail that preserves rationale and prevents rework; do not turn it into transcript chronology.
- `state`: what is true now and proven.
- `decisions`: sticky absolutes, approvals, rejected weak paths, canonical ownership choices, and architecture boundaries.
- `contextMap`: curated sources to consult, with rationale and use. This is the replacement for fixed read lists.
- `workingEdge`: current execution edge, plausible next route, and sequencing constraints. This is not a single mandatory "do now" line.
- `validation`: proof already obtained, stale checks, deferred checks, failures, and remaining gates.
- `risks`: active, inactive, or unknown risks whose resolution could change the next action. Inactive is not obsolete.
- `dormantContext`: inactive but important facts plus their reactivation trigger.
- `retiredContext`: obsolete facts, assumptions, paths, decisions, or tasks with reason, evidence, and replacement when relevant.
- `antiRework`: completed discovery, false starts, and duplication traps.
- `durableLearnings`: reusable rules from user feedback, friction, mistakes, or successful patterns.
- `durablePromotions`: durable changes that should be applied, rejected, deferred, marked already-covered, or marked none outside compaction.
- `agentGuideUpdates`: candidate guide changes or explicit reasons not to update the guide; this field is not a write payload.

## Reducer doctrine

- Do not append another continuation layer. Reconcile older durable state with newer evidence and output one replacement artifact.
- Preserve initiative purpose, definition of done, unresolved current plan, durable decisions, dormant-but-important facts, explicit approvals/exclusions, and unresolved risks until stronger evidence retires, supersedes, or amends them.
- If old state says to await user direction but newer context contains allowed work, mark the old await-direction state stale or superseded and continue the allowed work before asking for irreversible approval.
- Classify old information as inactive, done, obsolete, promoted, or unknown before dropping it.
- Retire obsolete information explicitly in `retiredContext`; silent deletion is allowed only for noise that cannot affect future action.
- Under token pressure, compress recent operational detail first, old validation detail second, and redundant milestone wording third. Never compress away purpose, completion criteria, active blockers, user approvals/exclusions, rejected-path rationale, or unresolved durable risks.

## Curation doctrine

- Do not impose or mention a numeric quota for sources, files, actions, or bullets.
- Include a source only when it changes likely action, prevents a mistake, or unlocks a decision.
- Exclude files that were merely read, merely touched, or only useful as provenance.
- Include modified files when inspection is safety-critical before future edits or validation.
- Keep commands exact when they are the next falsifiable check or the proven canonical gate.
- Mark stale validation as stale; do not promote it to current proof.
- Preserve unresolved conflicts and uncertainty instead of smoothing them over.
- Use `recencyLedger` for request/order conflicts; do not leave old and new plans co-active.

## Durable promotion policy

- Use `durablePromotions` for durable changes that belong outside the ledger in package docs or control-plane files such as README.md, the configured agent guide, PLAN.md, HANDOFF.md, or skill docs.
- Treat the compaction artifact as a proposal surface, not proof of a file write.
- Each durable promotion must use one status: `apply`, `reject`, `defer`, `already-covered`, or `none`.
- For non-`none` promotions, include target surface, proposal, evidence, durability, risk, and next action.
- A receiving agent should resolve non-`none` promotions through normal repo work before further mutation in the affected repo unless newer evidence rejects or defers them.
- If the repo uses HANDOFF.md, mention it only as a normal repo control-plane target; do not claim compaction wrote it.

## AGENTS.md candidate policy

- Use `agentGuideMarkdown` only for durable operating guidance: user preferences, corrected command truth, stable boundaries, reusable procedures, or repo rules that should govern future agents.
- If a learning belongs only to the active task, keep it in the continuation artifacts and set `agentGuideMarkdown` to null.
- If a guide update is warranted, emit the full replacement guide content and explain the reason in `agentGuideChangeReason`.
- Candidate notes alone do not write AGENTS.md; only non-null `agentGuideMarkdown` can be synced.
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
- Fill every required structured field with an array, using an empty array only when no item passes the Evidence Gate. Do not leave `recencyLedger` empty; use `unknown` when recency cannot be resolved from supplied evidence.
- Put a full AGENTS.md replacement in `agentGuideMarkdown` only when warranted; otherwise use null.

## Quality bar

The continuation turn should be able to read the structured ledger and optional repo documents, identify the newest active request, avoid stale/superseded plan state, and continue correctly without rereading the past.
