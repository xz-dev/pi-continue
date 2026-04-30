# Architecture

## Purpose

`pi-continue` owns the extension-layer continuation path for long Pi runs that fill context mid-run. `README.md` is the operator front door; this file is the precise runtime and artifact contract.

The package owns:

- one `/continue` command with a compact TUI action palette, typed shortcuts, and autocomplete
- a safe mid-run guard at Pi's awaited pre-provider `context` seam
- package-shaped compaction summaries for continuation
- the runtime prompt that resumes the same task after compaction
- optional repo-local continuation document sync when explicitly enabled
- optional repo-local agent guide refinement when explicitly enabled
- customizable system/user prompt assets and prompt override precedence for continuation synthesis

It does not patch Pi vendor code, fork sessions, switch sessions, rewrite transcript history, or maintain command/config aliases.

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
- history artifact version: `pi-continue-artifacts/v3`
- compaction detail kind: `pi-continue/v2`

Only the canonical surfaces above are package contract surfaces.

## Pi boundary

The installed Pi runtime verified for this contract is `@mariozechner/pi-coding-agent` 0.70.6. The required primitives are:

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
9. In `session_before_compact`, repair Pi preparations that would keep the whole branch while summarizing no messages because a completed tool-result suffix crossed `keepRecentTokens`; the repaired cut keeps the assistant that owns the suffix and summarizes the earlier same-turn prefix separately.
10. Build the package continuation summary in `session_before_compact`.
11. Optionally write repo documents in `session_compact` when their sync modes are enabled.
12. Send the continuation prompt after compaction completes.

The guard never rewrites context messages, never interrupts incomplete tool batches, and only adjusts native compaction preparations after Pi has already reached a complete assistant/tool-result checkpoint.

## Command contract

Canonical command:

```text
/continue
```

In UI-capable sessions, exact `/continue` opens the package-owned action palette. The palette is the primary UX and exposes:

- `Continue now` for immediate native compaction and same-session resume.
- `Queue until idle` for safe idle-point compaction.
- `Preview prompts` for read-only prompt inspection.
- `Status` for config, prompt provenance, and trigger state.
- `Project settings` and `Global settings`.
- `Reset project` and `Reset global`.

The palette has one focus target: action selection. `Enter` runs or opens the selected action without hidden steering text. Focus-capable actions use a separate optional focus prompt, opened from the palette, so text entry never competes with list navigation.

Typed shortcuts are the scriptable/power-user surface and are provided through the same command with argument completions:

```text
/continue steer [focus]
/continue queue [focus]
/continue preview [focus]
/continue status
/continue settings [project|global]
/continue reset [project|global]
```

In non-interactive modes, exact `/continue` preserves direct `steer` behavior instead of opening the palette, so RPC/automation never hangs on unavailable UI.

Successful compaction sends the runtime continuation prompt. Duplicate compaction starts are rejected while one is already running. If an automatic guard compaction fails for the same token estimate, the next identical guard event aborts the unsafe over-threshold replay and refuses to loop compaction repeatedly.

Top-level command aliases are absent.

## Runtime continuation prompt

The runtime continuation prompt is extension-owned copy sent after successful compaction. It tells Pi to use the new compaction summary as the primary Continuation Ledger, orient from the structured task, initiative charter, definition of done, recency ledger, current plan, progress trail, state, decisions, context map, working edge, validation, risks, dormant context, retired context, anti-rework, durable learnings, durable promotions, and agent-guide update notes, honor recency/supersession resolutions before older plan state, treat transcript/tool history as evidence rather than replay material, resolve non-`none` durable promotions through normal repo work before further mutation, treat AGENTS.md candidate updates as guidance unless the summary says they were written, and continue the active user task from the live working edge.

This prompt is separate from the summarization prompt assets because it drives the next agent turn rather than shaping the compaction artifacts.

## Structured history artifact

The history pass returns one strict JSON object. This is a Pi-native Continuation Ledger, not Codex's Markdown Initiative Ledger, but it carries the same conservation ideas in provider-portable JSON.

```json
{
  "version": "pi-continue-artifacts/v3",
  "brief": {
    "task": "...",
    "initiativeCharter": [],
    "definitionOfDone": [],
    "recencyLedger": [{
      "status": "active|amended|superseded|stale|confirmed|unknown",
      "subject": "...",
      "evidence": "...",
      "resolution": "..."
    }],
    "currentPlan": [],
    "progress": [],
    "state": [],
    "decisions": [],
    "contextMap": [{ "source": "...", "relevance": "...", "use": "..." }],
    "workingEdge": [],
    "validation": [],
    "risks": [],
    "dormantContext": [],
    "retiredContext": [],
    "antiRework": [],
    "durableLearnings": [],
    "durablePromotions": [{
      "status": "apply|reject|defer|already-covered|none",
      "targetSurface": "...",
      "proposal": "...",
      "evidence": "...",
      "durability": "...",
      "risk": "...",
      "nextAction": "..."
    }],
    "agentGuideUpdates": []
  },
  "document": {
    "task": "...",
    "initiativeCharter": [],
    "definitionOfDone": [],
    "recencyLedger": [{
      "status": "active|amended|superseded|stale|confirmed|unknown",
      "subject": "...",
      "evidence": "...",
      "resolution": "..."
    }],
    "currentPlan": [],
    "progress": [],
    "state": [],
    "decisions": [],
    "contextMap": [],
    "workingEdge": [],
    "validation": [],
    "risks": [],
    "dormantContext": [],
    "retiredContext": [],
    "antiRework": [],
    "durableLearnings": [],
    "durablePromotions": [],
    "agentGuideUpdates": []
  },
  "agentGuideMarkdown": null,
  "agentGuideChangeReason": "No durable guide change is warranted."
}
```

Runtime validation requires:

- `version` equal to `pi-continue-artifacts/v3`
- `brief` and `document` objects with every required structured field
- non-empty `task` strings
- arrays for initiativeCharter, definitionOfDone, recencyLedger, currentPlan, progress, state, decisions, contextMap, workingEdge, validation, risks, dormantContext, retiredContext, antiRework, durableLearnings, durablePromotions, and agentGuideUpdates
- at least one `recencyLedger` entry with status `active`, `amended`, `superseded`, `stale`, `confirmed`, or `unknown`, plus non-empty `subject`, `evidence`, and `resolution`
- `contextMap` entries with non-empty `source`, `relevance`, and `use`
- `durablePromotions` entries with status `apply`, `reject`, `defer`, `already-covered`, or `none`, plus non-empty `targetSurface`, `proposal`, `evidence`, `durability`, `risk`, and `nextAction`
- `agentGuideMarkdown` as either non-empty string or `null`
- `agentGuideChangeReason` as a non-empty string

Malformed or incomplete history output falls back to deterministic synthesis or aborts according to `fallbackMode`.

The split-prefix pass remains a simple tagged block because it is a narrow prefix note, not a multi-artifact contract. It may carry newer request or supersession facts for the history pass to resolve into `recencyLedger`:

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

- `initiativeCharter`: durable purpose, problem, user value, strategy, non-goals, and must-not-forget context
- `definitionOfDone`: completion criteria and blockers to declaring done
- `recencyLedger`: mandatory explicit active/amended/superseded/stale/confirmed/unknown resolution for request, plan, validation, and working-edge conflicts, especially when newer user requests supersede older await-direction state
- `currentPlan` and `progress`: the plan of record and milestone trail that prevent context collapse into a shallow next step
- `contextMap`: curated exact sources/resources with why each matters and how to use it
- `workingEdge`: commands, edits, checks, sequencing constraints, or decision points needed to continue
- `validation`: pass/fail/deferred/stale proof with exact commands and freshness when known
- `dormantContext`: inactive but important facts plus their reactivation trigger; inactive is not obsolete
- `retiredContext`: obsolete facts retired with reason, evidence, and replacement when they could affect future behavior
- `durableLearnings`: reusable user feedback, friction, corrected habits, and best-practice rules that remain valuable beyond the immediate subtask
- `durablePromotions`: durable changes to resolve outside compaction in canonical docs; non-`none` statuses are proposals for normal repo work, not proof of writes
- `agentGuideUpdates`: candidate durable AGENTS.md changes or reasons no guide change is warranted; candidate notes do not write the guide without a full `agentGuideMarkdown` replacement

There is no numeric cap in the prompt or code. The synthesizer preserves details only when they change the next agent's action, validation, safety, context routing, recency/supersession handling, durable promotion, durable guide update, blocker handling, dirty-state handling, approval boundary, dormant-state handling, retirement of obsolete facts, or repeated explicit user requirement.

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
- `agentGuideUpdates` are continuation notes only; they never write the guide by themselves
- `durablePromotions` are normal-work resolution proposals for canonical docs; they never prove a file write by themselves
- compaction details persist the agent-guide write status (`sync-off`, `no-replacement`, or `replacement-pending`) and the modeled change reason for operator observability
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
- read alternate config files or register command aliases
- write repo documents unless the matching sync mode is explicitly enabled
- act as a memory system, context pruner, or custom compaction framework

Incomplete tool-batch interruption should wait for a Pi-owned primitive that can settle pending tool-call/result pairs safely.
