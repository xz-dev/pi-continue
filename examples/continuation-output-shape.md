# Example continuation output shape

This is a shape example for rendered `brief` content. Real output uses actual session facts and omits any of the five entry-array sections (`Forbid`, `Established`, `Learned`, `Open`, `Next`) that have no entries this cycle. `Task` and `Done When` always appear.

The same rendered brief is what the receiver gets as its first turn after compaction, what is written to `CONTINUE.md` when `continuationDocSyncMode: "always"`, and what is shown in the TUI overlay when `showAfterCompact: true`. All three are the byte-identical render of the brief — pi-continue (the extension) renders them deterministically, not the synthesizer.

```text
## Task
Continue the v3 → v4 continuation ledger cutover for pi-continue.

## Done When
pnpm run gate exits 0 against the working tree and README, CHANGELOG, and assets describe pi-continue-artifacts/v4 only.

## Forbid
- Do not introduce a v3 compatibility shim. — source: user@msg-greenfield-decision
- Do not edit vendor/ paths. — source: user@msg-vendor-lock

## Established
- Finding 7 (duplicate channel) is invalid: the assertion path in delegation.test.ts covers it deterministically. — evidence: tests/delegation.test.ts:142; basis: test; reopen: if tests/delegation.test.ts changes around line 142
- Cross-service eventing uses queues, not pubsub. — evidence: user@msg-arch-decision: 'use queues; pubsub loses messages we cannot lose'; basis: user; reopen: none
- The OpenAI batch API delivers a webhook on terminal status. — evidence: doc:https://platform.openai.com/docs/api-reference/batch#webhooks; basis: doc; reopen: if the OpenAI batch spec changes
- pnpm run gate exits 0 against working tree at SHA abcd123. — evidence: cmd:pnpm run gate#exit-status-line; basis: output; reopen: if any file under extensions/ or tests/ changes

## Learned
- Multi-line content stuffed into a single brief field re-atomizes into spurious sub-entries on the next render cycle; flatten field values to single lines at synthesis time. — source: session experience: round-trip explosion observed during v4 stabilization
- Test runner needs `--loader ./tests/pi-peer-loader.mjs` to resolve internal Pi imports; plain `node --test` will fail with module-not-found. — source: cmd:node --no-warnings --experimental-strip-types --loader ./tests/pi-peer-loader.mjs --test tests/blocks.test.ts#first-line

## Open
- Does the gate still pass after the README rewrite? — verifies: Run pnpm run gate and observe exit 0 after committing README changes.
- Are the BAD/GOOD anchor pairs in history_initial.md sufficient for dumb-model adherence? — verifies: Run one real compaction cycle with a small model and inspect the resulting established entries for anchor specificity.

## Next
- Run pnpm run gate from the repo root. → Either exit 0 (closes the gate-pass open question) or a concrete failure to triage.
- If gate passes, perform the manual integration smoke described in CHANGELOG 0.7.0. → A new established entry covering same-session resume behavior.
```

## Anchor styles

The `evidence` field on every `established` entry must be a navigable identifier the receiver can look up. Bare file names ("tests/delegation.test.ts") are not anchors. Accepted styles:

- `path:line` — `tests/delegation.test.ts:142`
- `test:name` — `test:parseHistoryArtifacts rejects invalid basis`
- `cmd:command#output-anchor` — `cmd:pnpm run gate#exit-status-line`
- `doc:url#section` — `doc:https://platform.openai.com/docs/api-reference/batch#webhooks`
- `user@msg-id` — `user@msg-arch-decision: 'verbatim quote of the decision'`

The `basis` enum is fixed: `observed | test | output | user | doc`. Each `established` entry must declare exactly one basis matching the evidence form.

The `reopen` field is freeform. Use `"none"` only when the claim is absolute (immutable user directive, fixed vendor contract).

## Learned vs established

`established` and `learned` look similar but answer different questions:

- `established` — "what is currently true at this code location, with anchored proof?" Each entry has a `reopen` clause tied to its anchor. Used for closures the receiver should trust without re-verification.
- `learned` — "what did we discover during this session that we want to remember?" Cross-cutting insights from many reads, confirmed human preferences, dead-end paths with their reason, successful approaches worth reusing. `source` is looser than `established.evidence`; a narrative reference is acceptable when the lesson was derived from a sequence of events, not a single anchor.
