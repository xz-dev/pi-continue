# pi-continue

`pi-continue` is a Pi extension for the moment when context fills up while Pi is still working.

Pi already has native compaction. The rough edge is timing: during a long tool-heavy run, Pi can collect enough tool output to exceed the compaction threshold before normal auto-compaction gets a turn. The next model request may fail with `context_length_exceeded`, waste a large request, retry awkwardly, or stop even though the task was going fine.

This is the user-facing problem reported in Pi issues such as:

- [badlogic/pi-mono#2871](https://github.com/badlogic/pi-mono/issues/2871): auto-compaction is not checked mid-turn, so context can grow through long tool loops.
- [badlogic/pi-mono#3609](https://github.com/badlogic/pi-mono/issues/3609): Pi can send requests above the compaction threshold, especially with smaller local-model windows.

`pi-continue` catches the safe checkpoint after a completed tool batch and before the next model request. If context is over Pi's threshold, it runs Pi's own compaction and then asks Pi to continue the same task from the new summary.

It is not a replacement compactor. It is a continuation layer around Pi's native compaction.

## Highlights

- **Mid-run continuation:** detects a full context during a run, before the next provider request is sent.
- **Native Pi compaction:** uses `ctx.compact()`, `session_before_compact`, and Pi's normal session format.
- **Same-session resume:** sends a continuation prompt after compaction, so Pi keeps working in the current session.
- **Discoverable `/continue`:** opens a compact TUI action palette, with typed shortcuts and autocomplete for power users.
- **Custom prompts:** lets you override the system and user prompt assets without editing package source.
- **Continuation Ledger artifacts:** asks the summarizer for a strict JSON reducer ledger, then validates it before writing anything.
- **Model control:** inherits the current model/reasoning by default, or uses a pinned summarizer model.
- **Optional repo documents:** can write a repo-local continuation document and AGENTS.md refinement when explicitly enabled.

## Canonical corpus

- [`AGENTS.md`](AGENTS.md) — repo-local operating guide for coding agents.
- [`VISION.md`](VISION.md) — product intent, user problem, principles, success criteria, and non-goals.
- [`README.md`](README.md) — user/operator guide: install, commands, config, prompt customization, and boundaries.
- [`ARCH.md`](ARCH.md) — architecture contract: Pi boundaries, guard semantics, config ownership, artifacts, and runtime flow.
- [`examples/pi-continue.json`](examples/pi-continue.json) — full package config example.
- [`examples/pi-settings-compaction-75pct-272k.json`](examples/pi-settings-compaction-75pct-272k.json) — Pi compaction-threshold example.
- [`examples/continuation-output-shape.md`](examples/continuation-output-shape.md) — example continuation markdown shape.
- [`assets/`](assets/) — default system/user prompt corpus and the files you can override.

`CONTINUE.md` is optional runtime output when continuation-document sync is enabled. It is local state, not part of the tracked package corpus.

## How automatic continuation works

```text
Pi finishes an assistant/tool-result batch
-> pi-continue sees the completed tool results in the awaited context hook
-> estimated context is over Pi's compaction threshold
-> pi-continue aborts before the oversized request is sent
-> Pi prepares native compaction
-> pi-continue adjusts any checkpoint that would keep everything and summarize nothing
-> Pi saves the native compaction with pi-continue's structured summary
-> pi-continue sends a prompt telling Pi to continue from that summary
```

The guard only acts after Pi has complete tool results. It does not interrupt running tools or incomplete tool-call batches.

## Install

From npm:

```bash
pi install npm:pi-continue
```

From a local checkout:

```bash
pi install /absolute/path/to/pi-continue
```

For one run without installing:

```bash
pi -e /absolute/path/to/pi-continue
```

Pi packages run with your local user permissions. Review package source before installing third-party packages.

## Command

`pi-continue` exposes one slash command:

```text
/continue
```

In the interactive TUI, exact `/continue` opens a compact action palette:

```text
Continue
  Continue now        Compact now; resume this task
  Queue until idle    Wait, then compact
Inspect
  Preview prompts     Show prompts; no compaction
  Status              Show config and trigger
Configure
  Project settings
  Global settings
  Reset project
  Reset global
```

Press `Enter` to run or open the selected action. For actions that accept steering text, press `f` to open a separate optional focus prompt, then leave it blank to continue normally or add a short note such as `finish validation before release`.

Typed shortcuts remain supported and autocompleted:

```text
/continue steer focus on the failing auth migration and exact next commands
/continue queue preserve current file state and remaining validation steps
/continue preview focus on validation and AGENTS.md candidate updates
/continue status
/continue settings project
/continue settings global
/continue reset project
/continue reset global
```

Shortcut behavior:

- `steer [focus]`: continue now; abort active work if needed, compact, then send the continuation prompt.
- `queue [focus]`: wait for Pi to become idle, compact, then send the continuation prompt.
- `preview [focus]`: show the exact prompt payloads that would be used now.
- `status`: show effective config, prompt sources, compaction threshold, and document-write semantics.
- `settings [project|global]`: edit package settings in the TUI.
- `reset [project|global]`: delete the selected config file after confirmation.

In non-interactive modes, exact `/continue` keeps the safe direct behavior and runs `steer` instead of opening a palette, so RPC/automation never waits on an unavailable UI.

Only `/continue` is registered. Use exact `/continue` for the palette or `/continue status`, `/continue settings`, `/continue reset`, and `/continue preview` as shortcuts.

## Configuration

Global config:

```text
~/.pi/agent/extensions/pi-continue.json
```

Project config:

```text
<project-root>/.pi/extensions/pi-continue.json
```

Default config:

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

Useful settings:

- `midRunGuardEnabled`: enables the automatic mid-run guard.
- `summarizerModel`: `"inherit"` or a pinned `"provider/model"` summarizer.
- `reasoning`: `"inherit"`, `"off"`, `"minimal"`, `"low"`, `"medium"`, `"high"`, or `"xhigh"`.
- `continuationDocPath`: repo-relative path for the optional continuation document.
- `continuationDocSyncMode`: `"off"` by default; set `"always"` to write the continuation document after successful extension-owned compaction.
- `agentGuidePath`: repo-relative path for the optional agent guide refinement target.
- `agentGuideSyncMode`: `"off"` by default; set `"always"` to allow AGENTS.md writes only when the modeled artifact includes a full `agentGuideMarkdown` replacement.
- `promptOverridePolicy`: `"project-override"`, `"global-override"`, or `"package-default"`.
- `fallbackMode`: `"deterministic-summary"` or `"abort"` when modeled summary synthesis fails.

Malformed JSON config fails loudly instead of silently falling back to defaults. Config and command names outside this contract are not read.

AGENTS.md writes are off by default. Enable `agentGuideSyncMode: "always"` only when you want the model to be allowed to replace the configured guide after it identifies durable operating guidance, command corrections, or reusable repo rules. `agentGuideUpdates` are candidate notes in the continuation summary; they do not write the file by themselves. A write happens only when `agentGuideMarkdown` is non-null and contains the full replacement guide.

## Pi compaction threshold

`pi-continue` uses the same threshold as Pi core:

```text
estimated context tokens > model.contextWindow - compaction.reserveTokens
```

Configure the shared threshold in Pi settings:

```json
{
  "compaction": {
    "enabled": true,
    "reserveTokens": 68000,
    "keepRecentTokens": 20000
  }
}
```

`reserveTokens` and `keepRecentTokens` are absolute token counts. For a 272K context model, `reserveTokens: 68000` triggers near 75% usage.

## Prompt customization

The continuation summary is shaped by prompt assets under `assets/`. You can override both system prompts and user prompts without editing package source.

Override roots:

```text
~/.pi/agent/extensions/pi-continue/prompts/
<project-root>/.pi/extensions/pi-continue/prompts/
```

Package assets:

```text
assets/system/history_initial.md
assets/system/history_update.md
assets/system/split_prefix.md
assets/user/continuation_base.md
assets/user/history_initial.md
assets/user/history_update.md
assets/user/split_prefix.md
```

`promptOverridePolicy` decides whether project overrides, global overrides, or package defaults win. `/continue preview` shows the exact prompt payloads and source paths that would be used if you compacted now.

The default history prompts are provider-agnostic and optimized for current GPT-5-class behavior: outcome-first, explicit contract, concise evidence gate, reducer-style continuation ledger output, recency/supersession handling, durable-promotion handling, and no arbitrary reading-count cap.

## Continuation output

The history pass returns one strict JSON artifact object. It is a Pi-native Continuation Ledger: a reducer that reconciles older durable state with newer evidence instead of stacking chronological summaries. The `recencyLedger` makes active request order and superseded plan state explicit so older `await direction` guidance cannot survive as the active plan when newer allowed work exists.

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

Runtime behavior:

- `brief` is rendered into Pi's compaction summary inside the package-owned continuation block.
- `document` is rendered as full content for optional repo-local continuation document sync.
- `agentGuideMarkdown` is the full content for optional agent-guide sync, or `null` when no guide replacement is warranted.
- `agentGuideChangeReason` is a non-empty explanation of why the guide should or should not change.
- `durablePromotions` can propose durable changes to canonical docs such as AGENTS.md, ARCH.md, PLAN.md, HANDOFF.md, README.md, skill docs, or user-approved VISION.md; these are normal-work resolution items, not compaction write claims.
- `agentGuideUpdates` can name candidate guide changes even when `agentGuideMarkdown` is `null`; candidates are guidance, not writes.

The structured fields define the continuation contract:

- `initiativeCharter`, `definitionOfDone`, `recencyLedger`, `currentPlan`, and `progress` preserve the durable purpose, completion criteria, active request/supersession resolution, plan of record, and milestone trail across repeated compactions.
- `recencyLedger` must contain at least one entry and uses `active`, `amended`, `superseded`, `stale`, `confirmed`, or `unknown` to resolve request, plan, validation, or working-edge conflicts before the next agent acts.
- `contextMap` is the curated source route: include sources only when they unlock a decision, prevent rework, or reduce risk.
- `workingEdge` is the execution continuity map: commands, edits, checks, sequencing constraints, or decision points needed to continue.
- `validation` records exact proof and freshness, including stale/deferred/failing checks.
- `dormantContext` keeps inactive-but-important facts available; inactive is not obsolete.
- `retiredContext` names obsolete facts with reason, evidence, and replacement when they could affect future behavior.
- `durableLearnings` carries reusable user feedback, friction, corrected habits, and best-practice rules even when the immediate subtask is done.
- `durablePromotions` uses `apply`, `reject`, `defer`, `already-covered`, or `none` to tell the next agent what durable doc work to resolve outside compaction.
- `agentGuideUpdates` records candidate AGENTS.md refinements or why no guide update is warranted; only non-null `agentGuideMarkdown` can write the guide.

There is no numeric cap for source routing in prompts or code. The contract asks for judgment, rationale, and action value rather than count targets.

When guide sync is enabled and no full replacement is emitted, `pi-continue` leaves AGENTS.md unchanged and reports the modeled reason. The runtime continuation prompt tells the next turn to use the compaction summary as the primary Continuation Ledger, orient from the structured fields, honor recency/supersession resolutions before older plan state, resolve non-`none` durable promotions through normal repo work, avoid replaying completed discovery, treat AGENTS.md candidate updates as guidance unless written, and continue from the live working edge.

## What the summarizer sees

Pi prepares compaction from the current session branch after aborting and waiting for the agent to become idle. `pi-continue` receives Pi's compaction preparation:

- `messagesToSummarize`
- optional `turnPrefixMessages` for split turns
- `previousSummary`
- `firstKeptEntryId`
- `tokensBefore`
- file-operation metadata
- compaction settings

`pi-continue` also supplies the configured continuation document path/content, configured agent guide path/content, custom instructions, and read/modified path evidence.

Pi converts messages with `convertToLlm()` and serializes them with `serializeConversation()` inside conversation tags. Tool-call names and JSON arguments are included. Text tool results are included, but Pi's serializer truncates each serialized tool result to 2,000 characters with a truncation marker.

After compaction, Pi reconstructs context as the compaction summary followed by raw kept messages from `firstKeptEntryId` onward and any later messages.

## Boundaries

`pi-continue` does not:

- patch Pi or vendor code
- fork, switch, or create sessions
- rewrite transcript history
- interrupt running tools or incomplete tool-call batches
- synthesize missing tool results
- preserve partial in-flight model output as completed history
- act as a memory system, context pruner, or general custom compaction framework
- register alternate command aliases
- write `CONTINUE.md` or `AGENTS.md` unless the relevant sync mode is explicitly enabled

`pi-continue` deliberately stays narrow: it combines the extension-visible mid-run checkpoint, Pi native compaction, and automatic same-session continuation without claiming to own broader memory or compaction behavior.

## Development

```bash
git clone https://github.com/Tiziano-AI/pi-continue.git
cd pi-continue
pnpm test
jq empty examples/*.json package.json
npm pack --dry-run --json
printf '{"type":"get_commands"}\n' | pi --mode rpc --no-session --no-context-files
```

Expected command surface:

```text
continue
```
