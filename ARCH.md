# Architecture

## Purpose

`pi-continue` keeps long Pi runs moving through one package-owned continuation path.

The package owns:

- the `/continue` command family
- a safe mid-run guard at Pi's awaited pre-provider `context` seam
- package-shaped compaction summaries for continuation
- optional repo-local `CONTINUE.md` sync when explicitly enabled
- prompt assets and prompt override precedence for continuation synthesis

It does not patch Pi vendor code, fork sessions, switch sessions, rewrite transcript history, or maintain legacy command/config aliases.

## Canonical identity

The public package identity is `pi-continue`.

Canonical surfaces:

- source repo: `/Users/tiziano/Code/pi-continue`
- extension path: `extensions/continue/index.ts`
- npm package name: `pi-continue`
- config file: `pi-continue.json`
- commands: `/continue`, `/continue-status`, `/continue-settings`, `/continue-reset`, `/continue-preview`
- optional repo document: `CONTINUE.md`
- compaction detail kind: `pi-continue/v1`

No old package names, command aliases, config files, prompt tags, or extension paths are compatibility surfaces.

## Pi boundary

Pi 0.70.2 supplies the required primitives:

- `context` handlers are awaited before provider payload conversion.
- `ctx.abort()` aborts the active run.
- `ctx.compact()` starts Pi's native compaction pipeline.
- `session_before_compact` can provide custom compaction content.
- `session_compact` observes the saved compaction entry.
- `pi.sendUserMessage()` can start the next turn after compaction completes.

Current Pi auto-compaction checks occur after `agent_end` and before new prompts. They do not proactively stop long tool/model loops between completed tool results and the next model request. `pi-continue` owns that extension-layer gap until Pi core provides a native mid-turn checkpoint primitive.

## Mid-run guard

The safe guard seam is the awaited pre-provider `context` hook when the pending message list ends with one or more contiguous `toolResult` messages immediately preceded by an `assistant` message.

That shape means Pi has a complete assistant/tool-result batch:

```text
assistant: toolCall A, toolCall B
toolResult: A
toolResult: B
```

The guard flow:

1. Inspect pending context messages.
2. Continue only for the complete assistant/tool-result suffix shape.
3. Resolve project root and `pi-continue` config.
4. Read effective Pi compaction settings.
5. Estimate context tokens through Pi's compaction estimator.
6. Trigger when `estimatedTokens > model.contextWindow - reserveTokens`.
7. Abort the active run.
8. Start Pi compaction.
9. Build the package continuation summary in `session_before_compact`.
10. Optionally write `CONTINUE.md` in `session_compact` when sync is enabled.
11. Send the continuation prompt after compaction completes.

The guard never rewrites context messages and never interrupts incomplete tool batches.

## Command contract

Canonical command:

```text
/continue [steer|queue] [instructions]
```

Modes:

- `steer`: abort active work if needed, then compact now.
- `queue`: wait for idle, then compact.

Successful compaction sends the runtime continuation prompt. Duplicate compaction starts are rejected while one is already running. If an automatic guard compaction fails for the same token estimate, the next identical guard event aborts the unsafe over-threshold replay and refuses to loop compaction repeatedly.

## Continuation prompt

The runtime continuation prompt is extension-owned copy sent after successful compaction. It tells Pi to use the new compaction summary as primary context, follow `## Must Read` and `## Start From Here`, treat transcript/tool history as evidence rather than replay material, and continue the active user task from the next concrete step.

This prompt is separate from the summarization prompt assets because it drives the next agent turn rather than shaping the compaction artifacts.

## Compaction artifacts

The history pass returns two blocks:

- `<continuation>`: immediate next-turn note persisted in Pi's compaction summary
- `<continuation-md>`: full replacement content for optional `CONTINUE.md` sync

The split-prefix pass returns one block when Pi splits a turn:

- `<split-prefix>`: context needed to understand the raw kept suffix

The final persisted summary contains:

- `<continuation>`
- optional `<split-prefix>`
- optional `<continuation-compaction-details>` metadata when enabled
- optional `<read-files>` and `<modified-files>` tags when explicitly enabled

Default summaries do not render file path registries. File operations are available to the synthesizer for curation and stored in compact details for lifecycle bookkeeping, but rendered path tags are opt-in.

## Evidence gate

Generated continuation artifacts must include:

- `## Must Read`: at most five high-signal paths/resources with why each matters
- `## Start From Here`: the first concrete next action

The synthesizer preserves details only when they change the next agent's action, validation, safety, or reading route; prove current state; record a blocker, dirty state, failed validation, approval boundary, or exclusion; or encode explicit/repeated user requirements.

Terminal transcript and tool history are noisy evidence, not content to replay.

## Optional repo document

Default path:

```text
<project-root>/CONTINUE.md
```

Resolution:

- project root is the git root when available, otherwise the current cwd
- configured document path must stay repo-relative
- invalid or escaping paths fall back to `CONTINUE.md`

Sync behavior:

- default `continuationDocSyncMode` is `"off"`
- `"always"` writes `<continuation-md>` to the configured path
- writes are normalized and skipped when content is unchanged
- writes happen only after successful extension-owned compaction

## Config

Config paths:

```text
~/.pi/agent/extensions/pi-continue.json
<project-root>/.pi/extensions/pi-continue.json
```

Default values:

```json
{
  "enabled": true,
  "summarizerModel": "inherit",
  "reasoning": "inherit",
  "historyMaxTokens": null,
  "splitPrefixMaxTokens": null,
  "continuationDocPath": "CONTINUE.md",
  "continuationDocSyncMode": "off",
  "midRunGuardEnabled": true,
  "appendCompactionMetadata": false,
  "appendFileTags": false,
  "promptOverridePolicy": "project-override",
  "fallbackMode": "deterministic-summary"
}
```

`inherit` uses the current Pi session model and reasoning level. Operators can pin a dedicated summarizer model with `provider/model` and choose an explicit reasoning level. Malformed JSON in package config or Pi settings fails loudly instead of silently falling back to defaults.

## Prompt assets

Package defaults:

```text
assets/system/history_initial.md
assets/system/history_update.md
assets/system/split_prefix.md
assets/user/continuation_base.md
assets/user/history_initial.md
assets/user/history_update.md
assets/user/split_prefix.md
```

Override roots:

```text
~/.pi/agent/extensions/pi-continue/prompts/
<project-root>/.pi/extensions/pi-continue/prompts/
```

Precedence is controlled by `promptOverridePolicy`.

## Compaction input contract

Pi computes compaction preparation from the current branch after aborting and waiting for the agent to become idle. The package receives:

- `messagesToSummarize`
- `turnPrefixMessages`
- `firstKeptEntryId`
- `previousSummary`
- `fileOps`
- Pi compaction settings

The summarizer prompt is not a byte-for-byte session transcript. Pi converts preparation messages with `convertToLlm()` and serializes them with `serializeConversation()` inside `<conversation>` tags. Assistant tool-call names and JSON arguments are included. Text tool results are included but truncated to 2,000 characters with a truncation marker by Pi's serializer.

After compaction, Pi reconstructs context as the compaction summary followed by raw kept messages from `firstKeptEntryId` onward and any later messages.

## Threshold ownership

`pi-continue` shares Pi core's threshold:

```text
contextTokens > model.contextWindow - compaction.reserveTokens
```

Pi settings own the values:

```text
~/.pi/agent/settings.json
<project-root>/.pi/settings.json
```

One threshold owner avoids split-brain behavior where Pi core and the package disagree on when context is unsafe.

## Non-goals

The package does not:

- preserve arbitrary partial provider output from an aborted stream
- preserve uncompleted tool execution output as complete history
- interrupt incomplete multi-tool batches
- synthesize missing tool results
- patch Pi core
- fork or switch sessions
- read old config files or register old commands

Incomplete tool-batch interruption should wait for a Pi-owned primitive that can settle pending tool-call/result pairs safely.
