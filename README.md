# pi-continue

`pi-continue` is a Pi extension package for long runs. When context fills while Pi is still working, it saves a safe handoff with native Pi compaction and resumes the same task in the same Pi session.

The handoff is a structured Continuation Ledger, not a transcript replay. It tells the receiving agent what is still true, what changed recently, what to do next, which evidence is fresh, and what should not be repeated. The prompt assets are overrideable, while the ledger must still match the strict continuation artifact contract.

Optional repo-document writes are explicit opt-ins. A continuation can update the configured continuation document path, and it can replace the configured agent guide only when guide sync is enabled and the model emits a complete replacement guide. Candidate notes alone never write a file.

It is not a memory system, a session fork, a transcript rewriter, or a replacement for Pi's compaction format.

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

Requires Pi `0.72.0` or newer, where model-specific thinking support is described by `thinkingLevelMap`.

## Use `/continue`

Package-side automatic continuation is enabled by default. The trigger still follows Pi's compaction threshold. You can also use `/continue` directly.

Running only `/continue` opens a small action palette when UI is available. In non-interactive modes, `/continue` runs the direct continuation path instead of waiting for a UI.

| Command | What it does |
| --- | --- |
| `/continue` | Open the palette when UI is available; otherwise continue now. |
| `/continue steer [note]` | Save a handoff now, stopping the current assistant turn if needed, then resume in this session. |
| `/continue queue [note]` | Wait for Pi to be idle, then save a handoff and resume in this session. |
| `/continue preview [note]` | Show the handoff prompts that would be used; no compaction or resume. |
| `/continue status` | Show the latest continuation, current settings, prompt sources, trigger threshold, and document-write state. |
| `/continue ledger` | Show the latest Continuation Ledger in a temporary TUI panel; no transcript entry is appended. |
| `/continue settings [project\|global]` | Edit package settings. |
| `/continue reset [project\|global]` | Delete package settings after confirmation. |

Only `/continue` is registered. Typed subcommands such as `steer`, `queue`, and `status` are arguments to that command. There are no command aliases.

## Mid-run continuation

The automatic mid-run guard is the main reason to use this package. It acts when context fills while Pi is still working, before the next oversized provider request is sent.

It:

- waits for a completed assistant/tool-result batch
- checks Pi's own compaction threshold
- stops before the next oversized provider request is sent
- runs native Pi compaction
- runs the customizable handoff prompt
- writes the Continuation Ledger into the compaction summary
- sends the same-session resume prompt

The threshold belongs to Pi, not this package:

```text
estimated context tokens > model.contextWindow - compaction.reserveTokens
```

Configure the threshold in Pi settings:

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

Use `/continue status` after a continuation to see what happened. Status reports the latest local run: how the handoff started, whether the Continuation Ledger was created, which summarizer model ran, whether the resume request was sent, whether the resumed assistant turn completed, whether optional document sync updated anything, and what to do next. UI sessions can also show the latest Continuation Ledger as a temporary panel; this never appends another transcript entry. Failure states use explicit package messages rather than parsing provider error text.

If modeled Continuation Ledger creation fails, `pi-continue` stops before resuming and writes no guessed continuation artifact or repo document. Run `/continue status`, inspect the failure, use `/continue preview` after prompt or config changes, fix the model/auth/context issue, then retry when Pi is idle.

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
  "ledgerDisplayMode": "overlay"
}
```

Common settings:

| Setting | Meaning |
| --- | --- |
| `enabled` | Turns package behavior on or off. |
| `midRunGuardEnabled` | Enables automatic mid-run continuation. |
| `summarizerModel` | Uses the active Pi model with `"inherit"`, or a pinned `"provider/model"`. |
| `reasoning` | Uses Pi's setting with `"inherit"`, or a model-supported thinking level. Unsupported levels are hidden in settings and clamped through Pi's `thinkingLevelMap`. |
| `historyMaxTokens` / `splitPrefixMaxTokens` | Optional summary-token budgets; `null` uses Pi-derived defaults. |
| `continuationDocPath` | Repo-relative path for optional continuation document sync; default `"CONTINUE.md"`. |
| `continuationDocSyncMode` | `"off"` by default; `"always"` writes the configured continuation document path after successful extension-owned compaction. |
| `agentGuidePath` | Repo-relative path for optional full guide replacement; default `"AGENTS.md"`. |
| `agentGuideSyncMode` | `"off"` by default; `"always"` allows configured agent-guide replacement only when the artifact includes full guide content. |
| `appendCompactionMetadata` | `false` by default; when true, appends compact non-path metadata to the compaction summary. |
| `appendFileTags` | `false` by default; when true, appends current compaction read/modified file tags. |
| `promptOverridePolicy` | Chooses project overrides, global overrides, or package defaults. |
| `ledgerDisplayMode` | `"overlay"` shows the latest Continuation Ledger in a temporary TUI panel; `"off"` disables automatic display. |

Malformed JSON config fails loudly. Unknown config keys are ignored by the package parser. Command aliases are not registered.

## Custom handoff prompt

The handoff prompt is package-owned copy, but it is not fixed in code. Operators can replace the system and user prompt assets globally or per project.

The design is deliberately reducer-shaped. The prompt should preserve the active task and the decision edge, not every line of transcript. It should carry forward facts that prevent rework, retire stale plans, mark validation freshness, and keep durable lessons available to the receiving agent.

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

`promptOverridePolicy` decides whether project overrides, global overrides, or package defaults win. `/continue preview` shows the exact handoff prompts and source paths that would be used now.

## What gets continued

The receiving agent gets Pi's compacted summary plus the same-session resume prompt. The history pass must emit one strict JSON artifact with version `pi-continue-artifacts/v3`; `pi-continue` parses that artifact and renders it into Pi's persisted Markdown compaction summary.

The artifact includes:

- `brief`, rendered into Pi's compaction summary
- `document`, used for optional configured continuation-document sync
- `agentGuideMarkdown`, used only for a full configured agent-guide replacement when guide sync is enabled
- `agentGuideChangeReason`, the reason for changing or not changing the guide

The Continuation Ledger tracks the active task, initiative charter, definition of done, recency and supersession, current plan, progress, current state, decisions, context map, working edge, validation, risks, dormant context, retired context, anti-rework, durable learnings, durable promotions, and agent-guide update notes.

In practice:

- `recencyLedger` decides which request or plan is current.
- `contextMap` tells the next agent which sources matter and why.
- `workingEdge` says where to resume.
- `validation` says what proof is fresh, stale, failed, or missing.
- `risks`, `retiredContext`, and `antiRework` keep the next turn from repeating old mistakes.
- `durablePromotions` propose normal repo-doc updates; they are not proof that a file was written.
- `agentGuideUpdates` are candidate notes; they do not write the configured agent guide by themselves.

See [`examples/continuation-output-shape.md`](examples/continuation-output-shape.md) for a rendered shape.

## Optional repo documents and agent-guide updates

`pi-continue` can write repo-local continuation documents after compaction. These writes are explicit opt-ins.

The default guide path is `AGENTS.md`. When `agentGuideSyncMode` is `"always"`, a continuation may replace that guide with a full modeled update for durable operating guidance: repeated corrections, stable preferences, repo rules, and lessons learned during long runs. Candidate notes alone never write the file.

Default continuation document path:

```text
<project-root>/CONTINUE.md
```

Default agent guide path:

```text
<project-root>/AGENTS.md
```

Both paths are repo-relative and resolve against the project git root when available.

What can change:

- `continuationDocSyncMode: "off"` is the default.
- `continuationDocSyncMode: "always"` writes the rendered `document` artifact to the configured continuation document path after successful extension-owned compaction.
- `agentGuideSyncMode: "off"` is the default.
- `agentGuideSyncMode: "always"` writes only a full non-null `agentGuideMarkdown` replacement to the configured agent-guide path.
- `agentGuideUpdates` and `durablePromotions` are guidance/proposal fields, not write claims.
- Writes are normalized and skipped when content is unchanged.

In this repository, `CONTINUE.md`, `PLAN.md`, `AGENTS.md`, `ARCH.md`, and `VISION.md` are ignored local state. The npm package keeps README as its only top-level operator guide; it still ships the changelog, examples, and prompt Markdown assets. Automatic AGENTS.md writes remain off by default.

## Boundaries

`pi-continue` does not:

- patch Pi or vendor code
- fork, switch, or create sessions
- rewrite transcript history
- interrupt running tools or incomplete tool-call pairs
- synthesize missing tool results
- preserve partial in-flight model output as completed history
- act as a memory system, context pruner, or general custom-compaction framework
- register alternate command aliases
- write the configured continuation document or configured agent guide unless the relevant sync mode is explicitly enabled

## Development checks

Run the normal local gate before changing package behavior or public docs:

```bash
pnpm test
jq empty examples/*.json package.json
npm pack --dry-run --json --ignore-scripts
git diff --check
```

For command-surface changes, also verify the command list when feasible:

```bash
printf '{"type":"get_commands"}\n' | pi --mode rpc --no-session --no-context-files --no-skills --no-extensions -e /path/to/pi-continue
```

Expected extension command surface:

```text
continue
```

The npm package should include `README.md`, `LICENSE`, `assets/`, `examples/`, and `extensions/`. It should not include tests, `.pi/`, tarballs, local runtime files, ignored Markdown notes or guides, or pnpm validation files.
