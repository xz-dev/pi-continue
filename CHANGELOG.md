# Changelog

All notable changes to `pi-continue` are documented here.

## 0.6.2 - 2026-05-03

### Fixed

- Failed Continuation Ledger synthesis now returns Pi's compaction cancellation result instead of relying on thrown hook errors, preventing native fallback compactions from resuming as if a package handoff succeeded.
- Same-session resume dispatch now waits for both Pi compaction completion and matching package-owned `pi-continue/v3` `session_compact` proof for the active continuation run.
- Active native, invalid, or stale compaction proof now fails closed with bounded status diagnostics and no resume prompt.

### Added

- Status now reports saved handoff proof and bounded synthesis failure classifiers without storing transcript or raw provider output.

## 0.6.1 - 2026-05-03

### Fixed

- Split-prefix synthesis now returns raw summary text while runtime rendering owns the saved `<split-prefix>` wrapper; tagged, empty, malformed, or fenced split-prefix output fails closed.
- Same-session resume tracking now registers the awaited resume before dispatch, so synchronous Pi start events cannot be missed.
- Synthesis hard-fail status now preserves the actionable handoff failure reason through compaction error settlement.

### Changed

- Settings edits now patch only the selected scope instead of writing normalized defaults that could shadow broader config.
- `/continue settings` and `/continue reset` now reject invalid scope arguments instead of silently targeting project settings.
- Public docs, prompt assets, status text, and palette copy now use calmer configured-path handoff/resume language.

### Added

- Integration coverage for successful post-compaction continuation-document and configured agent-guide writes.
- Release provenance tests for the 0.6.1 package metadata and gallery image tag.

## 0.6.0 - 2026-05-02

### Breaking changes

- Modeled Continuation Ledger synthesis now fails closed. If the history pass, split-prefix pass, provider authentication, artifact parsing, or required structured output fails, `pi-continue` aborts the compaction instead of writing a guessed continuation artifact.
- Removed deterministic fallback summaries and the `fallbackMode` configuration surface. Existing `fallbackMode` settings are ignored and no longer materialize runtime behavior.
- Retired `pi-continue/v2` compaction details compatibility. Extension-owned compaction details now accept only the strict `pi-continue/v3` shape.

### Changed

- `/continue status` now reports whether the Continuation Ledger is ready, waiting, or stopped; fallback status and fallback guidance were removed.
- Failure reporting for synthesis, document sync, prompt dispatch, shutdown, and resume outcomes now uses explicit package-owned messages instead of parsing provider error text.
- Prompt assets now produce denser ledgers with one current working edge, clearer stale-context handling, durable promotions, durable learnings, dormant context, and retired context.
- Compaction metadata remains compact and path-free in the rendered summary, while explicit file tags are appended only when `appendFileTags` is enabled.

### Added

- Hard-fail tests proving synthesis/auth/parse/split failures do not send a continuation prompt and do not write `CONTINUE.md` or `AGENTS.md`.
- Strict v3 artifact and compaction-details tests for unknown keys, invalid optional fields, retired config keys, retired details versions, and stale fallback fields.
- Contract sentinel tests for rendered Continuation Ledger quality: no stale active slots, no duplicate semantics, no mandatory read-now headings, and no numeric read-route caps.
- Package dry-run coverage that verifies the npm candidate includes the public package corpus and excludes ignored local guides, tests, lockfiles, tarballs, and runtime state.

### Removed

- `extensions/continue/src/fallback.ts` and its deterministic fallback test suite.
- The package-level `fallbackMode` default, README/example documentation, status copy, command settings surface, and artifact status variant.
- Fragile parsing of provider error text for paths, tokens, and model references.
