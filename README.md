# pi-continue

`pi-continue` is a Pi package that keeps long Pi runs moving when context fills up mid-run.

Pi already has native compaction. The rough edge is timing: a tool-heavy task can collect enough output to cross the compaction threshold before Pi reaches its normal auto-compaction checkpoint. The next model request can fail, retry badly, or stop the run even though the work was progressing.

`pi-continue` watches the safe checkpoint after a completed assistant/tool-result batch and before the next provider request. When the session is over Pi's own threshold, it aborts the unsafe request, runs Pi native compaction, writes a structured Continuation Ledger into the compaction summary, and sends a same-session continuation prompt so Pi resumes the active task.

It is a narrow continuation layer around Pi's native compaction, not a replacement session format, memory system, context pruner, or vendor patch.

## Why it is interesting

- **Mid-run continuation:** catches context pressure during long tool loops, before the next oversized provider request is sent.
- **Same-session resume:** keeps the current Pi session and uses `pi.sendUserMessage()` after compaction instead of forking or switching sessions.
- **Native compaction:** uses Pi's `ctx.compact()`, `session_before_compact`, and `session_compact` pipeline.
- **Safe checkpointing:** acts only after complete assistant/tool-result batches; it never interrupts running tools or incomplete tool-call pairs.
- **Continuation Ledger:** turns noisy transcript and tool history into structured fields for task, plan, recency, context routing, validation, risks, durable learnings, durable promotions, and agent-guide notes.
- **Discoverable command:** exact `/continue` opens an action palette in the TUI, while typed shortcuts and autocomplete remain available.
- **Custom prompt assets:** system and user prompt assets can be overridden globally or per project without editing package source.
- **Optional repo docs:** continuation document and AGENTS.md sync are explicit opt-ins and are off by default.

## Canonical corpus

- [`README.md`](README.md): front door, install, command, config, operator behavior, boundaries.
- [`VISION.md`](VISION.md): product promise, user problem, principles, success criteria, non-goals.
- [`ARCH.md`](ARCH.md): precise architecture contract for Pi seams, guard semantics, artifacts, config ownership, and runtime flow.
- [`AGENTS.md`](AGENTS.md): repo-local operating guide for coding agents.
- [`assets/`](assets/): default system/user prompt corpus and override targets.
- [`examples/pi-continue.json`](examples/pi-continue.json): full package config example.
- [`examples/pi-settings-compaction-75pct-272k.json`](examples/pi-settings-compaction-75pct-272k.json): Pi compaction-threshold example.
- [`examples/continuation-output-shape.md`](examples/continuation-output-shape.md): rendered Continuation Ledger shape.
- [`tests/`](tests/): executable product and drift contract.

`CONTINUE.md` is optional runtime output when continuation-document sync is enabled. It is local state, not tracked package corpus.

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

The package registers one slash command:

```text
/continue
```

In a UI-capable Pi session, exact `/continue` opens the action palette:

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

Press `Enter` to run or open the selected action. For continuation actions, press `f` to add optional focus text such as `finish validation before release`.

Typed shortcuts are still supported and autocompleted:

```text
/continue steer [focus]
/continue queue [focus]
/continue preview [focus]
/continue status
/continue settings [project|global]
/continue reset [project|global]
```

Shortcut behavior:

- `steer [focus]`: compact now, aborting active Pi work if needed, then continue in this session.
- `queue [focus]`: wait until Pi is idle, compact, then continue in this session.
- `preview [focus]`: show the exact prompt payloads that would be used now.
- `status`: show effective config, prompt sources, threshold, and write semantics.
- `settings [project|global]`: edit scoped package settings in the TUI.
- `reset [project|global]`: delete scoped package settings after confirmation.

In non-interactive modes, exact `/continue` keeps the safe direct behavior and runs `steer` instead of opening a palette, so automation never waits on an unavailable UI.

Only `/continue` is registered. There are no command aliases.

## Automatic continuation

Automatic mid-run continuation is enabled by default.

```text
Pi finishes an assistant/tool-result batch
-> pi-continue sees the completed batch in Pi's awaited context hook
-> estimated context is over Pi's compaction threshold
-> pi-continue aborts before the oversized request is sent
-> Pi prepares native compaction
-> pi-continue repairs no-op native preparations when needed
-> Pi saves the extension-owned continuation summary
-> pi-continue sends the same-session continuation prompt
```

The trigger uses Pi core's threshold owner:

```text
estimated context tokens > model.contextWindow - compaction.reserveTokens
```

Configure that threshold in Pi settings, not in `pi-continue`:

```json
{
  "compaction": {
    "enabled": true,
    "reserveTokens": 68000,
    "keepRecentTokens": 20000
  }
}
```

`reserveTokens` and `keepRecentTokens` are absolute token counts. For a 272K context model, `reserveTokens: 68000` triggers near 75 percent usage. See [`examples/pi-settings-compaction-75pct-272k.json`](examples/pi-settings-compaction-75pct-272k.json).

## Configuration

Global package config:

```text
~/.pi/agent/extensions/pi-continue.json
```

Project package config:

```text
<project-root>/.pi/extensions/pi-continue.json
```

Default package config:

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

Common settings:

- `enabled`: disables all package behavior when false.
- `midRunGuardEnabled`: enables the automatic mid-run guard.
- `summarizerModel`: `"inherit"` uses the active Pi model, or pin `"provider/model"` for summaries.
- `reasoning`: `"inherit"`, `"off"`, `"minimal"`, `"low"`, `"medium"`, `"high"`, or `"xhigh"`.
- `historyMaxTokens` and `splitPrefixMaxTokens`: optional summary-token overrides; `null` uses Pi-derived defaults.
- `continuationDocSyncMode`: `"off"` by default; `"always"` writes the modeled continuation document after successful extension-owned compaction.
- `agentGuideSyncMode`: `"off"` by default; `"always"` allows AGENTS.md writes only when the artifact includes a full `agentGuideMarkdown` replacement.
- `promptOverridePolicy`: `"project-override"`, `"global-override"`, or `"package-default"`.
- `fallbackMode`: `"deterministic-summary"` or `"abort"` when modeled synthesis fails.

Malformed JSON config fails loudly instead of silently falling back to defaults. Config and command names outside this contract are not read.

## Prompt assets

The continuation summary is shaped by Markdown prompt assets. Operators can override them without editing package source.

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

`promptOverridePolicy` decides whether project overrides, global overrides, or package defaults win. `/continue preview` shows the exact prompt payloads and source paths that would be used now.

The default prompts are provider-agnostic and outcome-first. They ask for justified curation, not numeric source quotas.

## Continuation Ledger

The history pass returns one strict JSON artifact with version `pi-continue-artifacts/v3`.

It contains:

- `brief`: rendered into Pi's compaction summary inside the package-owned continuation block.
- `document`: rendered as the optional repo-local continuation document when sync is enabled.
- `agentGuideMarkdown`: a full guide replacement when guide sync is enabled and a durable guide write is warranted, otherwise `null`.
- `agentGuideChangeReason`: the modeled reason for changing or not changing the guide.

The ledger fields are the contract:

```text
task, initiativeCharter, definitionOfDone, recencyLedger,
currentPlan, progress, state, decisions, contextMap,
workingEdge, validation, risks, dormantContext,
retiredContext, antiRework, durableLearnings,
durablePromotions, agentGuideUpdates
```

`recencyLedger` must have at least one entry. It resolves active, amended, superseded, stale, confirmed, or unknown request and plan conflicts before the next agent acts.

`contextMap` is the curated source route. `workingEdge` is the execution continuity map. `validation` records exact proof and freshness. `durablePromotions` are normal-work proposals for durable docs; they are not proof that a file was written. `agentGuideUpdates` are candidate notes; they do not write AGENTS.md by themselves.

See [`ARCH.md`](ARCH.md#structured-history-artifact) for the full JSON contract and [`examples/continuation-output-shape.md`](examples/continuation-output-shape.md) for rendered output.

## Optional repo documents

Default continuation document path:

```text
<project-root>/CONTINUE.md
```

Default agent guide path:

```text
<project-root>/AGENTS.md
```

Both write paths are repo-relative and are resolved against the project git root when available.

Write semantics:

- `continuationDocSyncMode: "off"` is the default.
- `continuationDocSyncMode: "always"` writes the rendered `document` artifact after successful extension-owned compaction.
- `agentGuideSyncMode: "off"` is the default.
- `agentGuideSyncMode: "always"` writes only a full non-null `agentGuideMarkdown` replacement.
- `agentGuideUpdates` and `durablePromotions` are guidance/proposal fields, not write claims.
- Writes are normalized and skipped when content is unchanged.

In this repository, `CONTINUE.md` is ignored local state. `AGENTS.md` is tracked package corpus, but automatic AGENTS.md writes remain off by default.

## Boundaries

`pi-continue` does not:

- patch Pi or vendor code
- fork, switch, or create sessions
- rewrite transcript history
- interrupt running tools or incomplete tool-call batches
- synthesize missing tool results
- preserve partial in-flight model output as completed history
- act as a memory system, context pruner, or general custom-compaction framework
- register alternate command aliases
- write `CONTINUE.md` or `AGENTS.md` unless the relevant sync mode is explicitly enabled

The detailed runtime and Pi integration contract lives in [`ARCH.md`](ARCH.md).

## Development and release proof

Canonical local checks:

```bash
pnpm test
jq empty examples/*.json package.json
npm pack --dry-run --json
git diff --check
```

For command-surface changes, also verify the command list when feasible:

```bash
printf '{"type":"get_commands"}\n' | pi --mode rpc --no-session --no-context-files
```

Expected extension command surface:

```text
continue
```

`npm pack --dry-run --json` should include `AGENTS.md`, `README.md`, `VISION.md`, `ARCH.md`, `LICENSE`, `assets/`, `examples/`, and `extensions/`. It should not include tests, `.pi/`, tarballs, or `CONTINUE.md`.
