# Changelog

All notable changes to `pi-continue` are documented here.

## 0.6.0 - 2026-05-02

### Breaking changes

- Modeled Continuation Ledger synthesis now fails closed. If the history pass, split-prefix pass, provider authentication, artifact parsing, or required structured output fails, `pi-continue` aborts the compaction instead of writing a guessed continuation artifact.
- Removed deterministic fallback summaries and the `fallbackMode` configuration surface. Existing `fallbackMode` settings are ignored and no longer materialize runtime behavior.
- Retired `pi-continue/v2` compaction details compatibility. Extension-owned compaction details now accept only the strict `pi-continue/v3` shape.

### Changed

- `/continue status` now reports artifact synthesis as modeled, pending, or aborted; fallback status and fallback guidance were removed.
- Failure reporting for synthesis, document sync, prompt dispatch, shutdown, and resume outcomes now uses explicit package-owned messages instead of parsing provider error text.
- Prompt assets now emphasize the Continuation Ledger as a reducer with state ownership, semantic dominance, bloat control, one current working edge, durable promotions, durable learnings, dormant context, and retired context.
- Compaction metadata remains compact and path-free in the rendered summary, while explicit file tags are appended only when `appendFileTags` is enabled.

### Added

- Hard-fail tests proving synthesis/auth/parse/split failures do not send a continuation prompt and do not write `CONTINUE.md` or `AGENTS.md`.
- Strict v3 artifact and compaction-details tests for unknown keys, invalid optional fields, retired config keys, retired details versions, and stale fallback fields.
- Contract sentinel tests for rendered Continuation Ledger quality: no stale active slots, no duplicate semantics, no mandatory read-now headings, and no numeric read-route caps.
- Package dry-run coverage that verifies the npm candidate includes the public package corpus and excludes ignored local guides, tests, lockfiles, tarballs, and runtime state.

### Removed

- `extensions/continue/src/fallback.ts` and its deterministic fallback test suite.
- The package-level `fallbackMode` default, README/example documentation, status copy, command settings surface, and artifact status variant.
- Brittle provider/error string sanitization and redaction heuristics that attempted to infer paths, tokens, or model references from free text.
