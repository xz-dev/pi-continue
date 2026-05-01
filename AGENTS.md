# AGENTS.md

This file is the repo-local operating guide for agents working in `pi-continue`.

`pi-continue` is a Pi extension for one product promise: when a long Pi run fills context mid-run, Pi should compact at a safe checkpoint and continue the same task from the new summary.

## Canonical corpus

The tracked documentation corpus is intentionally small:

1. `README.md` — human operator guide: install, command, config, prompt customization, boundaries, and the compact product explanation.
2. `AGENTS.md` — agent operating guide: product invariants, runtime boundaries, code ownership, prompt rules, validation, and release procedure.

Read supporting package surfaces when they unlock a decision, prevent rework, or reduce risk:

3. `extensions/continue/index.ts` — extension entry point and Pi hook registration.
4. `extensions/continue/src/runtime.ts` and `extensions/continue/src/mid-run-guard.ts` — continuation lifecycle, prompt dispatch, retry blocking, guard trigger rules.
5. `extensions/continue/src/config.ts`, `extensions/continue/src/project.ts`, and `extensions/continue/src/blocks.ts` — config defaults, repo document resolution/writes, and structured artifact parsing.
6. `assets/` — customizable system/user prompt corpus.
7. `examples/` — public config and output examples.
8. `tests/` — executable contract.

`ARCH.md` and `VISION.md` are retired local notes in this repo. They are ignored and are not tracked or packaged. Do not re-track them unless the user explicitly restores the documentation corpus. `CONTINUE.md` is optional runtime output from the extension. It is ignored local state, not tracked package corpus. Do not re-track it.

## Product contract

Keep all surfaces aligned to these invariants:

- Same-session continuation, not handoff, fork, session switch, or memory replay.
- Native Pi compaction, not a replacement session format.
- Mid-run guard acts only after complete assistant/tool-result batches.
- Never interrupt running tools or incomplete assistant/tool-result pairs.
- Use Pi's threshold owner: `contextTokens > model.contextWindow - compaction.reserveTokens`.
- Continuation artifacts must use the structured `pi-continue-artifacts/v3` Continuation Ledger fields: task, initiativeCharter, definitionOfDone, recencyLedger, currentPlan, progress, state, decisions, contextMap, workingEdge, validation, risks, dormantContext, retiredContext, antiRework, durableLearnings, durablePromotions, and agentGuideUpdates. `recencyLedger` must have at least one entry.
- Do not preserve mandatory read-now/do-now heading constraints. Use `contextMap` for justified source routing, `workingEdge` for execution continuity, `recencyLedger` for active-request/supersession resolution, and the initiative-spine fields for durable purpose, plan, completion criteria, dormant context, and retired facts.
- Do not impose numeric read-route caps in prompts or code; ask for high-signal justified curation instead.
- Transcript, tool output, file lists, and logs are evidence, not replay material.
- The continuation ledger is a reducer, not a chronological summary; reconcile older durable state with newer evidence instead of stacking summary layers.
- Durable learnings, durable promotions, dormant-but-important context, and repeated user feedback should survive compaction when they still govern future action.
- Prompt behavior is intentionally customizable through system/user prompt assets.
- `/continue` UX must prefer discoverable UI and autocomplete over memorized subcommands: exact `/continue` opens the compact action palette when UI-capable, while typed subcommands remain shortcuts.
- AGENTS.md refinement is a configurable side effect and must stay off by default.
- AGENTS.md candidate notes are not writes; a sync write requires `agentGuideSyncMode: "always"` and a full non-null `agentGuideMarkdown` replacement.
- No command/config aliases unless the user explicitly changes the product contract.

## User-facing language

Write from the user's problem, not the implementation seam.

Prefer:

- "context fills up while Pi is still working"
- "mid-run continuation"
- "same-session resume"
- "custom system/user prompt assets"
- "native Pi compaction"
- "structured continuation artifacts"
- "Continuation Ledger"
- "initiative charter", "definition of done", "recency ledger", "current plan", "context map", "working edge", "dormant context", "retired context", "durable promotions", "durable learnings", and "agent guide updates"

Avoid leading with jargon such as "unsafe model call" or burying the product value under hook names. Hook names belong in architecture/runtime sections, not the opening pitch.

README should stay calm, fluent, declarative, concise, and useful for humans. Do not turn it into a machine contract or a marketing pitch. Lead with the mid-run capability, the customizable compact prompt, what is continued and handed to the receiving agent, and optional AGENTS.md refinement as a living/self-refining repo guide. Do not omit the core features: mid-run continuation, native compaction, same-session resume, `/continue`, customizable prompts, Continuation Ledger artifacts, durable promotions, and optional repo-document sync.

## Runtime boundaries

Pi integration depends on Pi extension semantics. Re-read installed Pi docs/source before changing hooks, compaction, session, provider payload, or RPC behavior:

- `/opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md`
- `/opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent/docs/compaction.md`
- `/opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent/docs/sessions.md`
- `/opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent/docs/session-format.md`
- installed runtime under `/opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent/dist/`

Current documented boundary:

- `context` handlers are awaited before provider payload conversion.
- `ctx.abort()` aborts the active run.
- `ctx.compact()` starts Pi native compaction.
- `session_before_compact` can provide extension-owned compaction content.
- `session_compact` observes the saved compaction entry.
- `pi.sendUserMessage()` starts the continuation turn after compaction.

Do not patch or edit Pi vendor code.

## Code structure

- `extensions/continue/index.ts` wires the single `/continue` command and Pi events.
- `src/palette-actions.ts` owns the `/continue` palette action catalog, result mapping, labels, descriptions, and effect copy.
- `src/palette.ts` owns the interactive `/continue` action palette, separate optional focus prompt, and stable rendering.
- `src/completions.ts` owns slash argument completions for typed `/continue` shortcuts.
- `src/command-shape.ts` owns pure command-shape decisions such as exact-palette routing and operator shortcut splitting.
- `src/config.ts` owns package config parsing/defaults and rejects malformed JSON loudly.
- `src/pi-settings.ts` reads effective Pi compaction settings.
- `src/mid-run-guard.ts` owns guard eligibility and threshold decisions.
- `src/runtime.ts` owns `/continue` action modes, compaction lifecycle state, continuation prompt dispatch, duplicate/failure guards.
- `src/commands.ts` owns `/continue settings`, `/continue reset`, and `/continue preview` operator flows plus status command orchestration.
- `src/status.ts` owns `/continue status` rendering, latest-event aftercare copy, prompt provenance, compaction threshold display, and document-write semantics.
- `src/continuation-event.ts` owns the bounded latest continuation event snapshot, allowlisted failure copy, stale-event denial, and document-sync outcome updates.
- `src/model-settings.ts` owns import-light summarizer model resolution and token-budget math.
- `src/model.ts` owns reasoning resolution and prompt-pass execution through the Pi AI adapter.
- `src/assets.ts` owns prompt override precedence.
- `src/prompt.ts` compiles runtime prompt payloads.
- `src/blocks.ts` parses the strict `pi-continue-artifacts/v3` Continuation Ledger JSON artifact and split-prefix block.
- `src/compaction-preparation.ts` owns package-level repair of native no-op compaction preparations that would summarize nothing while keeping the whole branch.
- `src/compose.ts` renders the persisted compaction summary.
- `src/details.ts` owns `pi-continue/v2` compaction details, including agent-guide write status and change reason.
- `src/project.ts` owns git-root resolution, repo-relative path sanitization, and optional repo document writes.

Keep one canonical owner for each behavior. Do not add parallel config keys, alternate command names, duplicate threshold math, or compatibility shims without explicit user approval.

## Prompt assets

Prompt assets are public product surface. When changing them:

- Keep the Evidence Gate and structured continuation field semantics intact.
- Preserve the strict JSON history artifact contract: `version`, `brief`, `document`, `agentGuideMarkdown`, and `agentGuideChangeReason`.
- Preserve Continuation Ledger reducer semantics: initiative charter, definition of done, recency/supersession resolution, current plan, progress trail, dormant context, retired context, validation freshness, anti-rework, and durable promotions.
- Preserve split-prefix behavior for compactions that cut inside a turn.
- Do not emit raw standalone XML/HTML tag lines in Markdown prompt assets; `tests/assets.test.ts` forbids them.
- Keep prompts concise, direct, outcome-first, and grounded.
- Do not ask the model to invent progress, validation, file contents, root cause, or AGENTS.md writes.
- Do not add numeric read-route caps. Ask for justified curation based on rework/risk/action value.
- Remember that operators can override both system and user prompt assets through global/project prompt roots.
- Keep `durablePromotions` as normal-work resolution proposals, `agentGuideUpdates` as candidate notes, and `agentGuideMarkdown` as the only modeled guide-write payload.

## Config and local state

Tracked examples and docs must match `DEFAULT_CONTINUE_CONFIG` in `extensions/continue/src/config.ts`.

Ignored local state:

- `.pi/` — project-local Pi settings/extension config and prompt overrides.
- `CONTINUE.md` — optional runtime continuation document.
- `ARCH.md` and `VISION.md` — retired local notes, not package corpus.
- package/build/cache artifacts already covered by `.gitignore`.

`README.md` and `AGENTS.md` are the tracked package docs in this repo. Runtime AGENTS.md replacement is possible only when `agentGuideSyncMode` is explicitly set to `"always"` and the artifact includes a full `agentGuideMarkdown` replacement; default must remain `"off"`.

Do not commit secrets, `.npmrc`, `.env*`, local Pi config, generated tarballs, or runtime continuation files. `pnpm-lock.yaml` and `pnpm-workspace.yaml` are tracked validation support for pnpm dependency/build-approval stability, but they are not npm package contents.

## Validation gates

Run the risk-appropriate gate before delivery. For normal docs/config/runtime alignment work, run:

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

Expected command surface:

```text
continue
```

`npm pack --dry-run --json` should include `AGENTS.md`, `README.md`, `LICENSE`, `assets/`, `examples/`, and `extensions/`. It should not include tests, `.pi/`, tarballs, `CONTINUE.md`, `PLAN.md`, `ARCH.md`, `VISION.md`, `pnpm-lock.yaml`, or `pnpm-workspace.yaml`.

## Release discipline

`npm publish` publishes the local filesystem selected by npm package rules, not the last Git commit. Do not publish from an uncommitted or unvalidated tree.

Recommended flow:

```bash
pnpm test
jq empty examples/*.json package.json
npm pack --dry-run --json
git diff --check
git status -sb
git add -A
git commit -m "..."
```

If `package.json` still needs a version bump, run `npm version <major|minor|patch|x.y.z>` after the change commit so npm creates the version commit and tag. If `package.json` is already at the intended release version, do not run `npm version`; create the matching tag after the commit instead:

```bash
git tag "v$(node -p 'require("./package.json").version')"
npm publish
git push origin main --follow-tags
```

Only create GitHub releases after npm publish and after pushing the version commit/tag.

## Working-tree rules

Before mutating, run `git status -sb` and inspect dirty files you need to touch. Dirty state can be user-owned. Do not stage, commit, revert, delete, or format unrelated changes unless the user explicitly asks.

If `CONTINUE.md` exists locally, leave it alone unless the task is specifically about continuation-doc behavior. It is ignored runtime output.

## Documentation alignment checklist

When a behavior, config key, command, artifact, prompt path, package file list, or boundary changes, update all relevant surfaces in the same pass:

- `README.md` for user/operator behavior and concise product explanation.
- `AGENTS.md` for repo-local agent procedure, product invariants, runtime boundaries, ownership, and release procedure.
- `examples/*.json` and example markdown for defaults and output shape.
- `assets/` for prompt behavior.
- `tests/` for executable expectations.
- `package.json` for package metadata and npm file inclusion.

Do not let docs claim a feature that runtime/tests do not implement, or let runtime expose behavior not explained in the tracked docs and tests.
