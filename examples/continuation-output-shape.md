# Example continuation output shape

This is a shape example for rendered `brief` content. Real output should use the actual session facts and omit irrelevant sections.

```text
## Task
Continue the approved prompt/command/continuation redesign after compaction.

## Initiative Charter
- Problem: long Pi runs can cross context limits mid-run and lose task continuity.
- Why it matters: the user wants Pi to keep working without redoing discovery or losing product intent.
- Strategy: use native Pi compaction plus a package-owned continuation ledger, not session forks or vendor patches.

## Definition Of Done
- Runtime compacts at safe checkpoints and sends a same-session continuation prompt.
- Prompt assets, parser, docs, examples, and tests agree on the ledger schema.
- Validation gate passes after final edits.

## Recency And Supersession
- active: current redesign request — evidence: latest user asked to land recency/supersession handling properly; resolution: update the v3 contract, docs, tests, and prompts before release approval.
- superseded: earlier await-direction state — evidence: newer allowed work exists before irreversible publish approval; resolution: finish adversarial review and validation choreography first.

## Current Plan
- Update prompt assets and parser contract.
- Align docs and examples.
- Run the repository gate before claiming completion.

## Progress And Milestone Trail
- Runtime already expects structured continuation artifacts.
- The command surface is consolidated under `/continue`.
- v3 now adds durable initiative-spine and recency-ledger fields inspired by Codex Continue's reducer ledger.

## Current State
- Runtime now expects `pi-continue-artifacts/v3` continuation ledger artifacts.

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
- Renaming old sections without adding initiative spine, recency/supersession resolution, durable promotion, dormant/retired context, and validation freshness is not acceptable.

## Dormant But Important
- Pi vendor compaction behavior may change; re-check installed Pi docs/source before changing compaction hooks.

## Retired Or Obsolete
- Mandatory `Read Before Acting` and `Resume Now` headings are obsolete; `contextMap` and `workingEdge` replace them.

## Anti-Rework
- Do not redo completed external prompt-research discovery unless a specific claim is missing evidence.

## Durable Learnings
- Avoid preserving a weak old contract under new labels; replace it with the product shape the user approved.

## Durable Promotions
- apply: ARCH.md — record continuation ledger conservation semantics; evidence: parser and prompt assets require v3 fields; durability: architecture docs own runtime contracts; risk: future prompt edits may drift if docs omit it; next: update ARCH.md before delivery.

## Agent Guide Updates
- Candidate: add durable prompt-contract rules to AGENTS.md if the next synthesis can emit a full replacement guide.
- Candidate notes alone do not write AGENTS.md; guide sync writes only non-null `agentGuideMarkdown`.
```
