# AGENTS.md

This file is the repo-local operating guide for agents working in `pi-continue`.

`pi-continue` is a Pi extension for one product promise: when a long Pi run fills context mid-run, Pi should compact at a safe checkpoint and continue the same task from the new summary.

## Canonical corpus

Read in this order when the task touches product, docs, or runtime behavior:

1. `VISION.md` — product promise, user problem, principles, success criteria, non-goals.
2. `README.md` — user/operator-facing contract: install, commands, config, prompt customization, boundaries.
3. `ARCH.md` — architecture contract: Pi seams, guard semantics, artifacts, config ownership, non-goals.
4. `extensions/continue/index.ts` — extension entry point and Pi hook registration.
5. `extensions/continue/src/runtime.ts` and `extensions/continue/src/mid-run-guard.ts` — continuation lifecycle, prompt dispatch, retry blocking, guard trigger rules.
6. `assets/` — customizable system/user prompt corpus.
7. `examples/` — public config examples.
8. `tests/` — executable contract.

`CONTINUE.md` is optional runtime output from the extension. It is ignored local state, not tracked package corpus. Do not re-track it.

## Product contract

Keep all surfaces aligned to these invariants:

- Same-session continuation, not handoff, fork, session switch, or memory replay.
- Native Pi compaction, not a replacement session format.
- Mid-run guard acts only after complete assistant/tool-result batches.
- Never interrupt running tools or incomplete assistant/tool-result pairs.
- Use Pi's threshold owner: `contextTokens > model.contextWindow - compaction.reserveTokens`.
- Continuation artifacts must include `## Must Read` and `## Start From Here`.
- Transcript, tool output, file lists, and logs are evidence, not replay material.
- Prompt behavior is intentionally customizable through system/user prompt assets.
- No legacy command/config aliases unless the user explicitly changes the product contract.

## User-facing language

Write from the user's problem, not the implementation seam.

Prefer:

- "context fills up while Pi is still working"
- "mid-run continuation"
- "same-session resume"
- "custom system/user prompt assets"
- "native Pi compaction"

Avoid leading with jargon such as "unsafe model call" or burying the product value under hook names. Hook names belong in architecture/runtime sections, not the opening pitch.

README should stay friendly, concise, and high-signal. Do not omit the core features: mid-run continuation, native compaction, same-session resume, `/continue`, and customizable prompts.

## Runtime boundaries

Pi integration depends on Pi extension semantics. Re-read installed Pi docs/source before changing hooks, compaction, session, provider payload, or RPC behavior:

- `/opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md`
- `/opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent/docs/compaction.md`
- `/opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent/docs/session.md`
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

- `extensions/continue/index.ts` wires commands and Pi events.
- `src/config.ts` owns package config parsing/defaults and rejects malformed JSON loudly.
- `src/pi-settings.ts` reads effective Pi compaction settings.
- `src/mid-run-guard.ts` owns guard eligibility and threshold decisions.
- `src/runtime.ts` owns `/continue`, compaction lifecycle state, continuation prompt dispatch, duplicate/failure guards.
- `src/model.ts` resolves summarizer model/reasoning and runs prompt passes.
- `src/assets.ts` owns prompt override precedence.
- `src/prompt.ts` compiles runtime prompt payloads.
- `src/blocks.ts`, `src/compose.ts`, and `src/details.ts` own artifact parsing/rendering/details.
- `src/project.ts` owns git-root resolution and optional continuation document writes.

Keep one canonical owner for each behavior. Do not add parallel config keys, alternate command names, duplicate threshold math, or compatibility shims without explicit user approval.

## Prompt assets

Prompt assets are public product surface. When changing them:

- Keep the Evidence Gate, `## Must Read`, and `## Start From Here` requirements intact.
- Preserve the distinction between `<continuation>` and `<continuation-md>`.
- Preserve split-prefix behavior for compactions that cut inside a turn.
- Do not emit raw standalone XML/HTML tag lines in Markdown prompt assets; `tests/assets.test.ts` forbids them.
- Keep prompts concise, direct, and grounded. Do not ask the model to invent progress or validation.
- Remember that operators can override both system and user prompt assets through global/project prompt roots.

## Config and local state

Tracked examples and docs must match `DEFAULT_CONTINUE_CONFIG` in `extensions/continue/src/config.ts`.

Ignored local state:

- `.pi/` — project-local Pi settings/extension config and prompt overrides.
- `CONTINUE.md` — optional runtime continuation document.
- package/build/cache artifacts already covered by `.gitignore`.

Do not commit secrets, `.npmrc`, `.env*`, local Pi config, generated tarballs, or runtime continuation files.

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
continue-status
continue-settings
continue-reset
continue-preview
```

`npm pack --dry-run --json` should include `AGENTS.md`, `README.md`, `VISION.md`, `ARCH.md`, `LICENSE`, `assets/`, `examples/`, and `extensions/`. It should not include tests, `.pi/`, tarballs, or `CONTINUE.md`.

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
npm version patch
npm publish
git push origin main --follow-tags
```

Only create GitHub releases after npm publish and after pushing the version commit/tag.

## Working-tree rules

Before mutating, run `git status -sb` and inspect dirty files you need to touch. Dirty state can be user-owned. Do not stage, commit, revert, delete, or format unrelated changes unless the user explicitly asks.

If `CONTINUE.md` exists locally, leave it alone unless the task is specifically about continuation-doc behavior. It is ignored runtime output.

## Documentation alignment checklist

When a behavior, config key, command, artifact, prompt path, package file list, or boundary changes, update all relevant surfaces in the same pass:

- `VISION.md` for product intent changes.
- `README.md` for user/operator behavior.
- `ARCH.md` for runtime contracts and ownership.
- `examples/*.json` for config defaults.
- `assets/` for prompt behavior.
- `tests/` for executable expectations.
- `package.json` for package metadata and npm file inclusion.

Do not let docs claim a feature that runtime/tests do not implement, or let runtime expose behavior not explained in docs.
