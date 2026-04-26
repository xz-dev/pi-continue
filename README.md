# pi-continue

`pi-continue` is a Pi extension that helps Pi keep going when the context fills up in the middle of a run.

This is the failure mode it is for:

1. You give Pi a long task.
2. Pi reads files, runs tools, and keeps working without returning to you.
3. Tool results make the context grow past the compaction threshold.
4. Pi is about to make another model request before normal auto-compaction has run.
5. The run can hit `context_length_exceeded`, waste a large request, retry awkwardly, or stop when the work was otherwise going fine.

Pi has native compaction, but this specific timing problem has shown up in public Pi issues:

- [badlogic/pi-mono#2871](https://github.com/badlogic/pi-mono/issues/2871): auto-compaction is not checked mid-turn, so context can grow unbounded during long tool loops.
- [badlogic/pi-mono#3609](https://github.com/badlogic/pi-mono/issues/3609): Pi can send requests above the compaction threshold, especially on smaller local-model context windows.

`pi-continue` works around that gap at the extension layer. When Pi reaches a safe mid-run checkpoint, it compacts the session with Pi's own compaction system and then asks Pi to continue the same task from the new summary.

It is not a replacement for Pi compaction. It is a continuation layer around Pi compaction.

## What happens during an automatic continuation

```text
Pi finishes a tool-call batch
-> pi-continue sees the completed tool results before the next model request
-> context is over Pi's compaction threshold
-> pi-continue aborts the current run before the oversized request is sent
-> Pi native compaction runs
-> pi-continue writes a continuation-focused compaction summary
-> pi-continue sends a prompt telling Pi to continue from that summary
```

From the user's point of view, the goal is simple: Pi should not get stuck just because the context filled while it was still working.

## What it does

- Adds automatic mid-run continuation when context is over threshold.
- Adds `/continue` for manual continuation compaction.
- Uses Pi's native `ctx.compact()` pipeline and session format.
- Writes a `<continuation>` block into the compaction summary.
- Sends a continuation prompt after compaction completes, so the same session resumes the task.
- Optionally writes a repo-local `CONTINUE.md` when explicitly configured.
- Uses the current Pi session model and reasoning level by default, with optional pinned summarizer settings.

## What it does not do

- It does not patch Pi or vendor code.
- It does not fork, switch, or create sessions.
- It does not rewrite transcript history.
- It does not interrupt running tools.
- It does not interrupt incomplete tool-call batches.
- It does not synthesize missing tool results.
- It does not preserve partial in-flight model output as if it were completed history.
- It does not try to be a memory system, context pruner, or custom compaction framework.

The guard only acts after Pi has a complete assistant/tool-result batch. If tool calls are still incomplete, it waits.

## Why this is separate from other Pi extensions

There are public Pi extensions for custom compaction summaries, context pruning, context caps, memory, and handoff to new sessions.

Among the easily discoverable public Pi extensions, `pi-continue` appears to be the only one that combines all three of these behaviors:

1. a mid-run checkpoint before the next provider request,
2. Pi's native compaction pipeline,
3. automatic same-session continuation after compaction.

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

## Commands

```text
/continue [steer|queue] [instructions]
/continue-status
/continue-settings
/continue-reset [project|global]
/continue-preview [instructions]
```

Examples:

```text
/continue
/continue steer focus on the failing auth migration and exact next commands
/continue queue preserve current file state and remaining validation steps
```

`/continue` defaults to `steer`.

Modes:

- `steer`: aborts active work if needed, compacts now, then sends the continuation prompt.
- `queue`: waits for Pi to become idle, compacts, then sends the continuation prompt.

Both modes use Pi's `session_before_compact` and `session_compact` extension seams.

## Automatic guard

The automatic guard is controlled by `midRunGuardEnabled`.

It evaluates only when the pending context ends with one or more contiguous `toolResult` messages immediately preceded by an `assistant` message. That shape means Pi has a complete tool-call batch:

```text
assistant: toolCall A, toolCall B
toolResult: A
toolResult: B
```

When that shape is present, the guard:

1. resolves the project and effective `pi-continue` config,
2. reads effective Pi compaction settings,
3. estimates context tokens through Pi internals,
4. compares the estimate to Pi's compaction threshold,
5. aborts the active run if the estimate is over threshold,
6. starts Pi native compaction,
7. builds the continuation summary through `session_before_compact`,
8. sends the continuation prompt after `ctx.compact()` completes.

The threshold is the same one Pi uses:

```text
estimated context tokens > model.contextWindow - compaction.reserveTokens
```

If a guard-triggered compaction fails, the package records the failed token estimate. If the same over-threshold request appears again, it aborts that retry instead of looping compaction attempts.

## Continuation summary

The history pass produces two artifacts:

- `<continuation>`: the immediate next-turn note saved in Pi's compaction summary.
- `<continuation-md>`: full content for optional repo-local `CONTINUE.md` sync.

Both artifacts must include:

- `## Must Read`: at most five high-signal paths or resources, with why each matters.
- `## Start From Here`: the first concrete command, edit, validation, or investigation step.

`Must Read` is a curated route, not a file-operation log. Transcript and tool history are evidence, not replay material.

The runtime continuation prompt tells the next turn to:

- use the compaction summary as primary context,
- follow `Must Read` and `Start From Here`,
- read repo `CONTINUE.md` only if the summary is missing details or appears stale,
- avoid redoing completed discovery,
- continue the active user task from the next concrete step.

## What the summarizer sees

Pi prepares compaction from the current session branch after aborting and waiting for the agent to become idle. `pi-continue` receives Pi's compaction preparation:

- `messagesToSummarize`,
- optional `turnPrefixMessages` for split turns,
- `previousSummary`,
- `firstKeptEntryId`,
- `tokensBefore`,
- file-operation metadata,
- compaction settings.

Pi converts messages with `convertToLlm()` and serializes them with `serializeConversation()` inside `<conversation>` tags. Tool-call names and JSON arguments are included. Text tool results are included, but Pi's serializer truncates each serialized tool result to 2,000 characters with a truncation marker.

After compaction, Pi reconstructs context as the compaction summary followed by raw kept messages from `firstKeptEntryId` onward and any later messages.

## Config

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
  "midRunGuardEnabled": true,
  "appendCompactionMetadata": false,
  "appendFileTags": false,
  "promptOverridePolicy": "project-override",
  "fallbackMode": "deterministic-summary"
}
```

Notes:

- `summarizerModel: "inherit"` uses the current Pi session model.
- `reasoning: "inherit"` uses the current Pi reasoning level when the selected model supports reasoning.
- Set `summarizerModel` to `"provider/model"` to pin a dedicated summarizer.
- Set `continuationDocSyncMode` to `"always"` to opt in to repo-local `CONTINUE.md` writes.
- Malformed JSON config fails loudly instead of silently falling back to defaults.
- Old config names are intentionally not read. This package has one current config contract.

Use `/continue-settings` to edit project or global config in the TUI.

### Pi compaction settings

`pi-continue` shares Pi core's compaction threshold instead of adding a second package-specific percentage knob. Configure it in Pi settings:

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

## Prompt overrides

Prompt assets live under `assets/` and can be overridden without editing package source.

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

`promptOverridePolicy` controls whether package defaults, global overrides, or project overrides win.

## Development

```bash
git clone https://github.com/Tiziano-AI/pi-continue.git
cd pi-continue
pnpm test
jq empty examples/*.json package.json
npm pack --dry-run --json
printf '{"type":"get_commands"}\n' | pi --mode rpc --no-session --no-context-files
```

Command surface:

```text
continue
continue-status
continue-settings
continue-reset
continue-preview
```
