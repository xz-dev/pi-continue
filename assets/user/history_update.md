Use the base Pi Continuation Ledger contract as the quality bar for both structured artifacts.

You are updating an existing continuation checkpoint and repo-local continuation document.

## Durable continuation document contract

- It replaces the configured repo-local continuation document in full after runtime rendering.
- It is broader and more stable than `brief`.
- It should merge still-correct durable material from the existing continuation document with the new history.
- It should remove stale, contradicted, or already-resolved guidance unless it remains useful as retired context, anti-rework, durable learning, or durable promotion evidence.
- It should preserve stable objectives, initiative charter, definition of done, active request recency, plan of record, progress rationale, decisions, constraints, implementation truth, dormant-but-important facts, retired/obsolete context, durable risks, `durableLearnings`, `durablePromotions`, `agentGuideUpdates`, and next execution edges.
- It should apply the same Evidence Gate as `brief`: keep only details that still affect future action, validation, safety, context routing, durable promotion, or durable operating guidance.
- Its `contextMap` should identify sources whose absence would likely cause rework, risk, or a wrong decision.
- Its `workingEdge` should explain how to resume work without reducing the artifact to one brittle next step.
- Its `durablePromotions` should carry forward unresolved non-`none` promotions until they are applied, rejected, deferred with a new next action, or proven already covered.
- It should not impose or mention a numeric reading quota.
- It should remove transient chat noise, provenance-only details, files read only for discovery, duplicated phrasing, and retired assumptions that no longer affect future behavior.
- Its `recencyLedger` must contain at least one entry and should mark older plan/await-direction state as superseded or stale when a newer user request creates allowed work before irreversible release approval.
- It should stand on its own for a future agent opening this repo later.
- It should be grounded in the supplied previous summary, existing continuation document, existing agent guide, and new history only.

## Agent guide candidate contract

- Preserve still-correct guide content when no durable rule changes.
- If the current AGENTS.md should change, set `agentGuideMarkdown` to the full replacement content for the configured guide path.
- Use `agentGuideUpdates` for candidate notes; candidate notes do not write AGENTS.md without non-null `agentGuideMarkdown`.
- If no durable operating rule should change, set `agentGuideMarkdown` to null and explain why in `agentGuideChangeReason`.
- Candidate guide changes should be active refinements or corrections, not a transcript summary.
- Do not use `durablePromotions` to imply AGENTS.md was written; it is a normal-work resolution surface.
