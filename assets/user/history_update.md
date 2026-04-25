Use the base `<continuation>` contract below as the quality bar for the immediate next-agent note.

You are updating an existing continuation checkpoint and repo-local continuation document.

## Literal `<continuation-md>` contract

- The document replaces the repo-local `CONTINUE.md` in full.
- It is broader and more durable than `<continuation>`.
- It should merge still-correct durable material from the existing continuation document with the new history.
- It should remove stale, contradicted, or already-resolved guidance.
- It should preserve stable objectives, decisions, constraints, implementation truth, durable risks, and next actions.
- It should apply the same Evidence Gate as `<continuation>`: keep only details that still affect future action, validation, safety, or reading route.
- It should include `## Must Read` near the top: at most five exact high-signal paths/resources with notes on why they matter.
- It should include `## Start From Here` near the top: the concrete next action or first verification step.
- It should remove transient chat noise, provenance-only details, files read only for discovery, and duplicated phrasing.
- It should stand on its own for a future agent opening this repo later.
- It should be grounded in the supplied history and existing continuation document only.
