# pi-continue

`pi-continue` is a Pi package that keeps long Pi runs moving when context fills up mid-run.

The main capability is timing. Pi already has native compaction, but a long tool-heavy run can hit the context limit before Pi reaches its normal checkpoint. `pi-continue` waits for a completed assistant/tool-result batch, asks Pi to compact, and resumes the same task in the same Pi session.

The compact prompt is fully customizable. Its job is not to replay the transcript; it reduces the run into a Continuation Ledger that tells the receiving agent what is still true, what changed recently, what to do next, what evidence is fresh, and what should not be repeated.

If enabled, each continuation can also produce a full AGENTS.md replacement. That lets a repo guide become a living, self-refining operating surface. It is off by default and only writes when the model emits a complete replacement, not just candidate notes.

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

## Use `/continue`

Automatic continuation is enabled by default. You can also use `/continue` directly.

In a UI-capable Pi session, exact `/continue` opens a small action palette. In non-interactive modes, exact `/continue` runs the direct continuation path instead of waiting for a UI.

| Command | What it does |
| --- | --- |
| `/continue` | Open the palette when UI is available; otherwise continue now. |
| `/continue steer [focus]` | Compact now, aborting active Pi work first if needed, then resume. |
| `/continue queue [focus]` | Wait until Pi is idle, compact, then resume. |
| `/continue preview [focus]` | Show the prompt payloads that would be used in a read-only scrollable overlay; no compaction. |
| `/continue status` | Show latest continuation aftercare, config, prompt sources, threshold, and write state in a read-only scrollable overlay. |
| `/continue ledger` | Show the latest Continuation Ledger in a transient TUI overlay; no transcript entry is appended. |
| `/continue settings [project\|global]` | Edit package settings. |
| `/continue reset [project\|global]` | Delete package settings after confirmation. |

Only `/continue` is registered. There are no command aliases.

## Mid-run continuation

The mid-run guard is the reason to use this package. It acts when context fills while Pi is still working, before the next oversized provider request is sent.

It:

- waits for a completed assistant/tool-result batch
- checks Pi's own compaction threshold
- aborts before the next oversized provider request is sent
- runs native compaction through Pi
- runs the customizable compact prompt
- writes structured continuation artifacts into the compaction summary
- sends the same-session continuation prompt

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

Use `/continue status` after a continuation to see what happened. Status reports the latest local event: source, checkpoint, artifact or fallback state, summarizer provenance, prompt dispatch, resume outcome, optional document sync, and the next safe action. UI sessions can also show the latest Continuation Ledger as a transient overlay; this never appends another transcript entry. Status and overlay copy do not show transcript text, prompt payloads, document contents, provider errors, or raw model output.

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
  "fallbackMode": "deterministic-summary",
  "ledgerDisplayMode": "overlay"
}
```

Common settings:

| Setting | Meaning |
| --- | --- |
| `enabled` | Turns package behavior on or off. |
| `midRunGuardEnabled` | Enables automatic mid-run continuation. |
| `summarizerModel` | Uses the active Pi model with `"inherit"`, or a pinned `"provider/model"`. |
| `reasoning` | Uses Pi's setting with `"inherit"`, or a specific reasoning level. |
| `historyMaxTokens` / `splitPrefixMaxTokens` | Optional summary-token budgets; `null` uses Pi-derived defaults. |
| `continuationDocSyncMode` | `"off"` by default; `"always"` writes `CONTINUE.md` after successful extension-owned compaction. |
| `agentGuideSyncMode` | `"off"` by default; `"always"` allows AGENTS.md replacement only when the artifact includes full guide content. |
| `promptOverridePolicy` | Chooses project overrides, global overrides, or package defaults. |
| `fallbackMode` | Uses deterministic fallback summaries, or aborts when modeled synthesis fails. |
| `ledgerDisplayMode` | `"overlay"` shows the latest Continuation Ledger as transient TUI aftercare; `"off"` disables automatic display. |

Malformed JSON config fails loudly. Unknown config keys and command aliases are not read.

## Custom compact prompt

The compact prompt is package-owned copy, but it is not fixed in code. Operators can replace the system and user prompt assets globally or per project.

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

`promptOverridePolicy` decides whether project overrides, global overrides, or package defaults win. `/continue preview` shows the exact prompt payloads and source paths that would be used now.

## What gets continued

The receiving agent gets Pi's compacted summary plus the same-session continuation prompt. The summary contains one JSON artifact with version `pi-continue-artifacts/v3`.

The artifact includes:

- `brief`, rendered into Pi's compaction summary
- `document`, used for optional `CONTINUE.md` sync
- `agentGuideMarkdown`, used only for a full AGENTS.md replacement when guide sync is enabled
- `agentGuideChangeReason`, the reason for changing or not changing the guide

The Continuation Ledger tracks the active task, initiative charter, definition of done, recency and supersession, current plan, progress, current state, decisions, context map, working edge, validation, risks, dormant context, retired context, anti-rework, durable learnings, durable promotions, and agent-guide update notes.

In practice:

- `recencyLedger` decides which request or plan is current.
- `contextMap` tells the next agent which sources matter and why.
- `workingEdge` says where to resume.
- `validation` says what proof is fresh, stale, failed, or missing.
- `risks`, `retiredContext`, and `antiRework` keep the next turn from repeating old mistakes.
- `durablePromotions` propose normal repo-doc updates; they are not proof that a file was written.
- `agentGuideUpdates` are candidate notes; they do not write AGENTS.md by themselves.

See [`examples/continuation-output-shape.md`](examples/continuation-output-shape.md) for a rendered shape.

## Optional repo docs and living AGENTS.md

`pi-continue` can write repo-local continuation documents after compaction. These writes are explicit opt-ins.

The more interesting option is agent-guide refinement. The default guide path is `AGENTS.md`; when `agentGuideSyncMode` is `"always"`, a continuation may replace that guide with a full modeled update. This can turn a repo-local guide into a living operating record for repeated corrections, stable preferences, repo rules, and durable lessons learned during long runs. Candidate notes alone never write the file.

Default continuation document path:

```text
<project-root>/CONTINUE.md
```

Default agent guide path:

```text
<project-root>/AGENTS.md
```

Both paths are repo-relative and resolve against the project git root when available.

Write semantics:

- `continuationDocSyncMode: "off"` is the default.
- `continuationDocSyncMode: "always"` writes the rendered `document` artifact after successful extension-owned compaction.
- `agentGuideSyncMode: "off"` is the default.
- `agentGuideSyncMode: "always"` writes only a full non-null `agentGuideMarkdown` replacement.
- `agentGuideUpdates` and `durablePromotions` are guidance/proposal fields, not write claims.
- Writes are normalized and skipped when content is unchanged.

In this repository, `CONTINUE.md`, `PLAN.md`, `AGENTS.md`, `ARCH.md`, and `VISION.md` are ignored local state. The npm package keeps README as its only Markdown guide. Automatic AGENTS.md writes remain off by default.

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
- write `CONTINUE.md` or `AGENTS.md` unless the relevant sync mode is explicitly enabled

## Development checks

Run the normal local gate before changing package behavior or public docs:

```bash
pnpm test
jq empty examples/*.json package.json
npm pack --dry-run --json
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
