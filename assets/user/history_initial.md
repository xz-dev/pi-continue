Use the base Pi Continuation Ledger contract as the quality bar for both structured artifacts.

For `document`, write the durable repo-local continuation document content through structured fields, not through a fixed heading template.

## Durable continuation document contract

- It replaces the configured repo-local continuation document in full after runtime rendering.
- It is broader and more stable than `brief`.
- It should preserve stable objectives, initiative charter, definition of done, active request recency, plan of record, progress rationale, decisions, constraints, implementation truth, dormant-but-important facts, retired/obsolete context, durable risks, `durableLearnings`, `durablePromotions`, `agentGuideUpdates`, and next execution edges.
- It should apply the same Evidence Gate as `brief`: keep only details that still affect future action, validation, safety, context routing, durable promotion, or durable operating guidance.
- Its `contextMap` should identify sources whose absence would likely cause rework, risk, or a wrong decision.
- Its `workingEdge` should explain how to resume work without reducing the artifact to one brittle next step.
- Its `durablePromotions` should identify durable changes that deserve normal repo-doc resolution outside compaction, or one status `none` item when none exists.
- It should not impose or mention a numeric reading quota.
- It should remove transient chat noise, provenance-only details, files read only for discovery, duplicated phrasing, and retired assumptions that no longer affect future behavior.
- Its `recencyLedger` must contain at least one entry and should mark older plan/await-direction state as superseded or stale when a newer user request creates allowed work before irreversible release approval.
- It should stand on its own for a future agent opening this repo later.
- It should be grounded in the supplied history, existing continuation document, and existing agent guide only.

## Agent guide candidate contract

- If the configured agent guide should change, set `agentGuideMarkdown` to the full replacement content for the configured guide path.
- Use `agentGuideUpdates` for candidate notes; candidate notes do not write the configured guide without non-null `agentGuideMarkdown`.
- If no durable operating rule should change, set `agentGuideMarkdown` to null and explain why in `agentGuideChangeReason`.
- Candidate guide changes should be active refinements or corrections, not a transcript summary.
- Do not use `durablePromotions` to imply the configured guide was written; it is a normal-work resolution surface.
