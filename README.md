# pi-continue

Keep long Pi runs moving.

`pi-continue` is a Pi package that watches for safe continuation points, compacts the session through Pi's native compaction pipeline, and sends a focused prompt so the next turn can keep working without replaying the whole transcript.

## What it does

- Adds `/continue` for immediate or queued continuation compaction.
- Adds a mid-run guard that stops after completed tool results and before the next over-threshold model request.
- Writes a compact `<continuation>` note into Pi's compaction summary.
- Optionally writes a repo-local `CONTINUE.md` document when explicitly enabled.
- Uses your current Pi session model and reasoning level by default.
- Lets you pin a dedicated summarizer model and reasoning level when you want one.

It does not patch Pi, fork sessions, switch sessions, rewrite transcript history, interrupt incomplete tool batches, or preserve partial in-flight model/tool output as complete history.

## Install

From npm after publication:

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

Behavior:

- `/continue` defaults to `steer`.
- `steer` aborts an active run first, then compacts and sends the continuation prompt.
- `queue` waits for Pi to become idle, then compacts and sends the continuation prompt.
- Both modes use Pi's `session_before_compact` and `session_compact` extension seams.

## Mid-run guard

When `midRunGuardEnabled` is true, the package checks the awaited pre-provider `context` hook whenever the pending context ends with completed tool results.

It triggers when:

```text
estimated context tokens > model.contextWindow - compaction.reserveTokens
```

This shares Pi core's compaction threshold instead of adding a second package-specific percentage knob. Configure the shared threshold in Pi settings:

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

The guard runs only after a complete assistant/tool-result batch. It does not interrupt a partial tool batch or synthesize missing tool results.

## What the continuation model sees

Pi prepares compaction from the current session branch after aborting and waiting for the agent to become idle. The package receives Pi's compaction preparation:

- `messagesToSummarize`
- optional `turnPrefixMessages` for split turns
- `firstKeptEntryId` for the raw suffix Pi keeps after compaction

The summarizer does not receive a verbatim JSONL transcript. Pi converts messages with `convertToLlm()` and serializes them with `serializeConversation()` inside `<conversation>` tags. Tool-call names and JSON arguments are included. Text tool results are included, but Pi truncates each serialized tool result to 2,000 characters with a truncation marker.

After compaction, the next Pi context is the continuation summary plus the raw kept suffix from `firstKeptEntryId` onward.

## Output contract

The history pass produces:

- `<continuation>`: the immediate next-turn note saved in Pi's compaction summary
- `<continuation-md>`: full content for optional repo-local `CONTINUE.md` sync

Both artifacts must include:

- `## Must Read`: at most five high-signal paths or resources with why each matters
- `## Start From Here`: the first concrete command, edit, validation, or investigation step

`Must Read` is a curated route, not a file-operation log. Transcript and tool history are evidence, not replay material.

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
- Existing old config names are intentionally not read. This package is a cold, single-owner contract.

Use `/continue-settings` to edit project or global config in the TUI.

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
cd /Users/tiziano/Code/pi-continue
pnpm test
jq empty examples/*.json package.json
npm pack --dry-run --json
printf '{"type":"get_commands"}\n' | pi --mode rpc --no-session --no-context-files
```

Expected command surface:

```text
continue
continue-status
continue-settings
continue-reset
continue-preview
```
