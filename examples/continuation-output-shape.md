# Example continuation output shape

This is a shape example for rendered `brief` content. Real output should use the actual session facts and omit irrelevant sections.

```text
## Task
Continue the approved prompt/command/continuation redesign after compaction.

## Current State
- Runtime now expects structured continuation artifacts.
- The command surface is consolidated under `/continue`.

## Decisions and Constraints
- Do not preserve the old mandatory read-now/do-now heading contract.
- Do not impose numeric caps on source routing.
- AGENTS.md writes stay off by default and require a full `agentGuideMarkdown` replacement when enabled.

## Context Map
- `/repo/ARCH.md` — architecture contract; use it to verify runtime boundaries and artifact ownership.
- `/repo/extensions/continue/src/blocks.ts` — structured artifact parser/renderer; use it before changing JSON fields.
- `/repo/tests/blocks.test.ts` — executable artifact contract; use it to validate parser behavior.

## Working Edge
- Update prompt assets, docs, and tests to the same structured field vocabulary.
- Run the repository gate before claiming completion.

## Validation
- `pnpm test` must pass after the final contract edits.

## Risks
- Renaming old sections without adding durable learning, anti-rework, validation, and guide-update signals is not acceptable.

## Anti-Rework
- Do not redo completed external prompt-research discovery unless a specific claim is missing evidence.

## Durable Learnings
- Avoid preserving a weak old contract under new labels; replace it with the product shape the user approved.

## Agent Guide Updates
- Candidate: add durable prompt-contract rules to AGENTS.md if the next synthesis can emit a full replacement guide.
- Candidate notes alone do not write AGENTS.md; guide sync writes only non-null `agentGuideMarkdown`.
```
