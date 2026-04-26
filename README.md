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
- **Manual control:** adds `/continue` for immediate or queued continuation compaction.
- **Custom prompts:** lets you override the system and user prompt assets without editing package source.
- **Model control:** inherits the current model/reasoning by default, or uses a pinned summarizer model.
- **Optional continuation doc:** can write a repo-local continuation document when explicitly enabled.

## Canonical corpus

- [`AGENTS.md`](AGENTS.md) — repo-local operating guide for coding agents.
- [`VISION.md`](VISION.md) — product intent, user problem, principles, success criteria, and non-goals.
- [`README.md`](README.md) — user/operator guide: install, commands, config, prompt customization, and boundaries.
- [`ARCH.md`](ARCH.md) — architecture contract: Pi boundaries, guard semantics, config ownership, artifacts, and runtime flow.
- [`examples/pi-continue.json`](examples/pi-continue.json) — full package config example.
- [`examples/pi-settings-compaction-75pct-272k.json`](examples/pi-settings-compaction-75pct-272k.json) — Pi compaction-threshold example.
- [`assets/`](assets/) — default system/user prompt corpus and the files you can override.

`CONTINUE.md` is optional runtime output when continuation-doc sync is enabled. It is local state, not part of the tracked package corpus.

## How automatic continuation works

```text
Pi finishes an assistant/tool-result batch
-> pi-continue sees the completed tool results in the awaited context hook
-> estimated context is over Pi's compaction threshold
-> pi-continue aborts before the oversized request is sent
-> Pi native compaction runs
-> pi-continue writes a continuation-focused summary
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

Modes:

- `steer` aborts active work if needed, compacts now, then sends the continuation prompt.
- `queue` waits for Pi to become idle, compacts, then sends the continuation prompt.

`/continue` defaults to `steer`.

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
- `continuationDocSyncMode`: `"off"` by default; set `"always"` to write the continuation document.
- `promptOverridePolicy`: `"project-override"`, `"global-override"`, or `"package-default"`.
- `fallbackMode`: `"deterministic-summary"` or `"abort"` when modeled summary synthesis fails.

Malformed JSON config fails loudly instead of silently falling back to defaults. Old config names are intentionally not read.

Use `/continue-settings` to edit project or global config in the TUI.

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

`promptOverridePolicy` decides whether project overrides, global overrides, or package defaults win. `/continue-preview` shows the exact prompt payloads and source paths that would be used if you compacted now.

## Continuation output

The history pass produces two artifacts:

- `<continuation>`: the immediate next-turn note saved in Pi's compaction summary.
- `<continuation-md>`: full content for optional repo-local continuation document sync.

Both artifacts must include:

- `## Must Read`: at most five high-signal paths or resources, with why each matters.
- `## Start From Here`: the first concrete command, edit, validation, or investigation step.

The runtime continuation prompt tells the next turn to use the compaction summary as primary context, follow `Must Read` and `Start From Here`, avoid replaying completed discovery, and continue the active user task from the next concrete step.

## What the summarizer sees

Pi prepares compaction from the current session branch after aborting and waiting for the agent to become idle. `pi-continue` receives Pi's compaction preparation:

- `messagesToSummarize`
- optional `turnPrefixMessages` for split turns
- `previousSummary`
- `firstKeptEntryId`
- `tokensBefore`
- file-operation metadata
- compaction settings

Pi converts messages with `convertToLlm()` and serializes them with `serializeConversation()` inside `<conversation>` tags. Tool-call names and JSON arguments are included. Text tool results are included, but Pi's serializer truncates each serialized tool result to 2,000 characters with a truncation marker.

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

Among the easily discoverable public Pi extensions reviewed for this package, `pi-continue` appears to be the only one combining a mid-run checkpoint before the next provider request, Pi native compaction, and automatic same-session continuation. That is a scoped source-review claim, not a universal claim about private or unindexed extensions.

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
