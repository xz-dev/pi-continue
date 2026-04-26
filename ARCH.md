# Architecture

## Purpose

`pi-continue` owns the extension-layer continuation path for long Pi runs that fill context mid-run.

The package owns:

- one `/continue` command with action and operator subcommands
- a safe mid-run guard at Pi's awaited pre-provider `context` seam
- package-shaped compaction summaries for continuation
- the runtime prompt that resumes the same task after compaction
- optional repo-local continuation document sync when explicitly enabled
- optional repo-local agent guide refinement when explicitly enabled
- customizable system/user prompt assets and prompt override precedence for continuation synthesis

It does not patch Pi vendor code, fork sessions, switch sessions, rewrite transcript history, or maintain legacy command/config aliases.

## Canonical identity

The public package identity is `pi-continue`.

Canonical surfaces:

- source repo: `https://github.com/Tiziano-AI/pi-continue`
- agent operating guide: `AGENTS.md`
- product intent: `VISION.md`
- operator guide: `README.md`
- architecture contract: `ARCH.md`
- extension path: `extensions/continue/index.ts`
- npm package name: `pi-continue`
- config file: `pi-continue.json`
- command: `/continue`
- optional runtime continuation document: `CONTINUE.md`
- optional agent guide target: `AGENTS.md`
- history artifact version: `pi-continue-artifacts/v2`
- compaction detail kind: `pi-continue/v2`

No old package names, command aliases, config files, prompt tags, or extension paths are compatibility surfaces.

## Pi boundary

Pi 0.70.2 supplies the required primitives:

- `context` handlers are awaited before provider payload conversion.
- `ctx.abort()` aborts the active run.
- `ctx.compact()` starts Pi's native compaction pipeline.
- `session_before_compact` can provide custom compaction content.
- `session_compact` observes the saved compaction entry.
- `pi.sendUserMessage()` can start the next turn after compaction completes.

Current Pi auto-compaction checks occur after `agent_end` and before new prompts. They do not proactively stop long tool/model loops between completed tool results and the next model request. That user-facing gap is context-full work that stalls, retries poorly, or sends an oversized provider request while Pi is still working. `pi-continue` owns that extension-layer gap until Pi core provides a native mid-turn checkpoint primitive.

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
7. Abort the active run before the oversized provider request is sent.
8. Start Pi compaction.
9. Build the package continuation summary in `session_before_compact`.
10. Optionally write repo documents in `session_compact` when their sync modes are enabled.
11. Send the continuation prompt after compaction completes.

The guard never rewrites context messages and never interrupts incomplete tool batches.

## Command contract

Canonical command:

```text
/continue [steer|queue|status|settings|reset|preview] [arguments]
```

Subcommands:

- `steer`: abort active work if needed, then compact now.
- `queue`: wait for idle, then compact.
- `status`: show effective config, prompt provenance, and Pi threshold.
- `settings [project|global]`: edit package settings in the TUI.
- `reset [project|global]`: delete the selected config file.
- `preview [instructions]`: render the prompt payloads that would be used now.

`/continue` defaults to `steer`. Successful compaction sends the runtime continuation prompt. Duplicate compaction starts are rejected while one is already running. If an automatic guard compaction fails for the same token estimate, the next identical guard event aborts the unsafe over-threshold replay and refuses to loop compaction repeatedly.

The old top-level commands are intentionally absent.

## Runtime continuation prompt

The runtime continuation prompt is extension-owned copy sent after successful compaction. It tells Pi to use the new compaction summary as primary context, orient from the structured task/state/decision/context-map/working-edge/validation/risk/anti-rework/durable-learning fields, treat transcript/tool history as evidence rather than replay material, treat AGENTS.md candidate updates as guidance unless the summary says they were written, and continue the active user task from the live working edge.

This prompt is separate from the summarization prompt assets because it drives the next agent turn rather than shaping the compaction artifacts.

## Structured history artifact

The history pass returns one strict JSON object:

```json
{
  "version": "pi-continue-artifacts/v2",
  "brief": {
    "task": "...",
    "state": [],
    "decisions": [],
    "contextMap": [{ "source": "...", "relevance": "...", "use": "..." }],
    "workingEdge": [],
    "validation": [],
    "risks": [],
    "antiRework": [],
    "durableLearnings": [],
    "agentGuideUpdates": []
  },
  "document": {
    "task": "...",
    "state": [],
    "decisions": [],
    "contextMap": [],
    "workingEdge": [],
    "validation": [],
    "risks": [],
    "antiRework": [],
    "durableLearnings": [],
    "agentGuideUpdates": []
  },
  "agentGuideMarkdown": null,
  "agentGuideChangeReason": "No durable guide change is warranted."
}
```

Runtime validation requires:

- `version` equal to `pi-continue-artifacts/v2`
- `brief` and `document` objects with every required structured field
- non-empty `task` strings
- arrays for state, decisions, contextMap, workingEdge, validation, risks, antiRework, durableLearnings, and agentGuideUpdates
- `contextMap` entries with non-empty `source`, `relevance`, and `use`
- `agentGuideMarkdown` as either non-empty string or `null`
- `agentGuideChangeReason` as a non-empty string

Malformed or incomplete history output falls back to deterministic synthesis or aborts according to `fallbackMode`.

The split-prefix pass remains a simple tagged block because it is a narrow prefix note, not a multi-artifact contract:

```text
<split-prefix>...</split-prefix>
```

## Compaction summary shape

The final persisted summary contains:

- a package-owned continuation block containing rendered `brief` fields
- optional split-prefix block
- optional compaction metadata when enabled
- optional read/modified path tags when explicitly enabled

Default summaries do not render file path registries. File operations are available to the synthesizer for curation and stored in compact details for lifecycle bookkeeping, but rendered path tags are opt-in.

## Evidence gate

Generated continuation artifacts use structured fields instead of mandatory read-now/do-now headings. The key behavioral fields are:

- `contextMap`: curated exact sources/resources with why each matters and how to use it
- `workingEdge`: commands, edits, checks, sequencing constraints, or decision points needed to continue
- `durableLearnings`: reusable user feedback, friction, corrected habits, and best-practice rules that remain valuable beyond the immediate subtask
- `agentGuideUpdates`: candidate durable AGENTS.md changes or reasons no guide change is warranted

There is no numeric cap in the prompt or code. The synthesizer preserves details only when they change the next agent's action, validation, safety, context routing, durable guide update, blocker handling, dirty-state handling, approval boundary, or repeated explicit user requirement.

Terminal transcript and tool history are noisy evidence, not content to replay.

## Optional repo documents

Default continuation document path:

```text
<project-root>/CONTINUE.md
```

Default agent guide path:

```text
<project-root>/AGENTS.md
```

Both are runtime output targets only when their sync modes are enabled. `CONTINUE.md` is ignored local state in this repo. `AGENTS.md` is tracked package corpus here, but automatic AGENTS.md writes remain off by default.

Resolution:

- project root is the git root when available, otherwise the current cwd
- configured document paths must stay repo-relative
- invalid or escaping continuation paths fall back to `CONTINUE.md`
- invalid or escaping agent-guide paths fall back to `AGENTS.md`

Sync behavior:

- default `continuationDocSyncMode` is `"off"`
- `"always"` writes the rendered `document` artifact to the configured continuation path
- default `agentGuideSyncMode` is `"off"`
- `"always"` writes `agentGuideMarkdown` to the configured guide path only when the modeled artifact provides a full replacement
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
  "agentGuidePath": "AGENTS.md",
  "agentGuideSyncMode": "off",
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

Prompt assets are provider-agnostic. The default history prompts are tuned for current GPT-5-class behavior by being outcome-first, contract-explicit, concise, evidence-gated, and structured without prescribing a numeric reading quota.

## Compaction input contract

Pi computes compaction preparation from the current branch after aborting and waiting for the agent to become idle. The package receives:

- `messagesToSummarize`
- `turnPrefixMessages`
- `firstKeptEntryId`
- `previousSummary`
- `fileOps`
- Pi compaction settings

The package supplies the summarizer with:

- project root
- configured continuation document path and existing content
- configured agent guide path and existing content
- custom compaction instructions
- read and modified file-operation evidence

The summarizer prompt is not a byte-for-byte session transcript. Pi converts preparation messages with `convertToLlm()` and serializes them with `serializeConversation()` inside conversation tags. Assistant tool-call names and JSON arguments are included. Text tool results are included but truncated to 2,000 characters with a truncation marker by Pi's serializer.

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
- rewrite transcript history
- read old config files or register old commands
- write repo documents unless the matching sync mode is explicitly enabled
- act as a memory system, context pruner, or custom compaction framework

Incomplete tool-batch interruption should wait for a Pi-owned primitive that can settle pending tool-call/result pairs safely.
