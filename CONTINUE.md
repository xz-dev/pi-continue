# Continuation

## Current Snapshot

- Repository: `/Users/tiziano/Code/pi-continue`.
- This is the first durable continuation document supplied for the repo in this context.
- The preserved history contains read/research activity only. It does not preserve a concrete user feature request, bug, implementation plan, completed edit, test result, or root-cause finding.
- No files were modified in the supplied history. Pre-existing working-tree changes are unknown until checked with Git.
- Automatic mid-run compaction triggered because the session exceeded the configured context threshold. This explains the handoff but does not imply any code failure.

## Must Read

- `/Users/tiziano/Code/pi-continue/README.md` — understand the project’s intended behavior and setup before changing it.
- `/Users/tiziano/Code/pi-continue/ARCH.md` — understand the architecture and stable design constraints before touching internals.
- `/Users/tiziano/Code/pi-continue/extensions/continue/index.ts` — entry point for the extension and Pi hook registration.
- `/Users/tiziano/Code/pi-continue/extensions/continue/src/runtime.ts` — likely core runtime/orchestration logic for continuation behavior.
- `/Users/tiziano/Code/pi-continue/package.json` — authoritative scripts, dependencies, and validation entry points.

## Start From Here

Run:

```sh
cd /Users/tiziano/Code/pi-continue
git status --short
```

Then read the current user prompt and the Must Read files above. If no concrete objective is present, ask the user for the desired next action before modifying files.

## Durable Constraints

- Do not infer a pending task from the list of files previously read.
- Do not claim tests passed or behavior was validated unless you run or inspect current validation output yourself.
- Treat external Pi-agent internals/docs as references, not as repo state. Re-open them only when changing extension-hook, compaction, session, or RPC integration.
- Preserve exact behavior around continuation and compaction; changes should be backed by source review and tests.

## Reference Paths For Pi-Agent Integration Work

Use these only when the task touches Pi extension, compaction, session, runtime, or hook semantics:

- `/opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md`
- `/opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent/docs/compaction.md`
- `/opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent/docs/session.md`
- `/opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent/dist/core/extensions/runner.js`
- `/opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent/dist/core/compaction/compaction.js`

## Validation Guidance

- Start from `package.json` to identify the project’s intended commands.
- Before editing behavior, inspect the tests closest to the touched code, especially files under `/Users/tiziano/Code/pi-continue/tests/`.
- After editing, run the narrow relevant tests first, then broader package validation if available.
