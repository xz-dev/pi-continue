# Example continuation output shape

This is a shape example for the modeled `<continuation>` content. Real output should use the actual session facts and omit irrelevant sections.

```text
## Must Read
- `/repo/ARCH.md` — canonical architecture and ownership decisions; read before changing runtime boundaries.
- `/repo/extensions/continue/src/runtime.ts` — continuation prompt and compaction lifecycle; read before editing continuation flow.
- `/repo/tests/runtime.test.ts` — executable expectations for continuation and guard behavior; read before changing runtime copy.

## Start From Here
- Run the targeted failing test or inspect the named runtime file before broader discovery.

## Current State
- Summarize only still-relevant implementation truth, decisions, validation, blockers, and user intent.

## Constraints
- Preserve exact paths, commands, errors, and decisions that change continuation.
- Treat transcript and tool history as evidence, not replay.
- Do not dump every file that was read or modified.
```
