Use the base continuation contract as the quality bar for both structured artifacts.

For `document`, write the durable repo-local continuation document content through structured fields, not through a fixed heading template.

## Durable continuation document contract

- It replaces the configured repo-local continuation document in full after runtime rendering.
- It is broader and more stable than `brief`.
- It should preserve stable objectives, decisions, constraints, implementation truth, durable risks, `durableLearnings`, `agentGuideUpdates`, and next execution edges.
- It should apply the same Evidence Gate as `brief`: keep only details that still affect future action, validation, safety, context routing, or durable operating guidance.
- Its `contextMap` should identify sources whose absence would likely cause rework, risk, or a wrong decision.
- Its `workingEdge` should explain how to resume work without reducing the artifact to one brittle next step.
- It should not impose or mention a numeric reading quota.
- It should remove transient chat noise, provenance-only details, files read only for discovery, and duplicated phrasing.
- It should stand on its own for a future agent opening this repo later.
- It should be grounded in the supplied history, existing continuation document, and existing agent guide only.

## Agent guide candidate contract

- If the current AGENTS.md should change, set `agentGuideMarkdown` to the full replacement content for the configured guide path.
- If no durable operating rule should change, set `agentGuideMarkdown` to null and explain why in `agentGuideChangeReason`.
- Candidate guide changes should be active refinements or corrections, not a transcript summary.
