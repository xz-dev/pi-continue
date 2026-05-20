# Changelog

All notable changes to `pi-continue` are documented here.

## 0.7.0 - 2026-05-20

### Breaking changes

- Retired `pi-continue-artifacts/v3`. The continuation envelope is now `pi-continue-artifacts/v4` with a seven-slot `brief` (`task`, `done_when`, `forbid`, `established`, `learned`, `open`, `next`). The prior 18-slot brief (`initiativeCharter`, `definitionOfDone`, `recencyLedger`, `currentPlan`, `progress`, `state`, `decisions`, `contextMap`, `workingEdge`, `validation`, `risks`, `dormantContext`, `retiredContext`, `antiRework`, `durableLearnings`, `durablePromotions`, `agentGuideUpdates`) is gone.
- Compaction details kind is now `pi-continue/v4`. `pi-continue/v3` and `pi-continue/v2` details are rejected by the proof gate.
- Top-level envelope keys are `version`, `brief`, `agentGuideUpdate`. The prior `document` field is gone — `CONTINUE.md` is now a deterministic render of `brief` produced by the extension, byte-identical to what the receiver gets as its first turn after compaction. The synthesizer no longer writes `document`; the `agentGuideUpdate: {content, reason}` shape stays.
- New `learned` slot: derived insights from the cycle (cross-file patterns, confirmed human preferences, dead-end paths with their reason, successful approaches worth reusing). Entries are `{lesson, source}`; `source` may be a navigable anchor or a narrative reference. `learned` carries forward across cycles like `established`; entries retire only by replacement or explicit human retraction.
- The synthesizer prompts (system and user) and the receiver prompt are rewritten from a Memento spine. The synthesizer's role is articulated as the agent's persistent memory across amnesia between cycles. The three principles are persistence (never silent-drop established or learned entries), continuity (refine the prior brief, do not rewrite from scratch), and single channel (the brief is the receiver's only durable memory). The receiver prompt mirrors the framing: the agent is told it is continuing its own work, the brief above is the tattoo it wrote for itself in the prior cycle, and other summaries in the turn must be ignored.
- The synthesizer prompts disambiguate three parties explicitly: the synthesizer (reading these instructions), the agent (the model doing the work in the transcript), and the human (the person the agent is serving, whose messages appear with `role: user` inside transcript blocks — distinct from the `role: user` wrapper pi-continue uses to deliver instructions).
- `session_before_compact` opts out when no extension-owned continuation event is active. Native `/compact` and Pi's automatic threshold trips now run the native Pi summarizer; pi-continue no longer produces a half-styled artifact it cannot resume from.
- Renamed config knob: `ledgerDisplayMode: "overlay" | "off"` is now `showAfterCompact: boolean` (default `true`). When true, the rendered brief surfaces in a TUI overlay right after each successful extension-owned compaction. Same behavior, clearer name.
- `ParsedHistoryArtifacts` renamed: `continuation` → `briefMarkdown`. The `documentMarkdown` field is gone with the retired `document` slot.
- Removed the split-prefix synthesizer entirely. The history synthesizer now receives both completed-turn content (`<history-to-summarize>`) and in-progress turn-prefix content (`<turn-prefix-messages>`) in one pass and emits a single structured brief. The `<split-prefix>` block and `assets/{system,user}/split_prefix.md` are gone; the `splitPrefixMaxTokens` config key is removed.
- Runtime filter strips pi-continue's own `CONTINUATION_PROMPT` from the transcript before the synthesizer sees it; the synthesizer is the agent's memory of the work, not of the harness. Parser-level `singleLineString` normalization collapses any accidental multi-line field values so round-trip rendering cannot explode entries on the next cycle.
- Updated the package gallery image URL to the v0.7.0 source tag.

### Migration

Sessions compacted under `pi-continue-artifacts/v3` cannot resume under v4; `/continue status` reports invalid handoff proof and the resume fails closed. Restart any in-progress thread before installing 0.7.0. Operators with `continuationDocSyncMode: "always"` will see their CONTINUE.md replaced by the rendered brief on the first v4 compaction (no longer a freeform separate document). Operators with custom `ledgerDisplayMode` settings should switch to `showAfterCompact: true | false`. `appendFileTags` is replaced by `appendReadFileTags` and `appendModifiedFileTags`; modified-file tags default on and read-file tags default off. The brief remains the only required receiver memory channel.

### Why the rewrite

The v3 schema was a planning-document ontology: 18 fuzzy slots, prose-heavy prompts, and an Evidence Gate that told the synthesizer to drop the provenance anchors that would have prevented rework. v4 reshaped the brief as a research ledger with anchored evidence, but the synthesizer prompts still drifted across cycles — silent drops of established entries created amnesia in the amnesiac agent. The 0.7.0 pass reframes the synthesizer from a per-cycle summarizer into the agent's persistent memory: every slot, principle, and algorithm step flows from the Memento role articulation rather than from case-specific anti-failure rules. The new `learned` slot captures derived insights that anchored `established` entries cannot carry (cross-cutting lessons, confirmed preferences, failure-mode wisdom, reusable approaches). The receiver prompt mirrors the framing so the agent reads the brief as its own prior-cycle work, not as external instructions to second-guess.

## 0.6.7 - 2026-05-08

### Added

- `/continue settings` can now edit the human-facing handoff trigger while writing Pi's `compaction.reserveTokens` at the selected project or global settings scope.

### Changed

- Updated the package gallery image URL to the v0.6.7 source tag.

## 0.6.6 - 2026-05-08

### Changed

- Elevated the package description and README opening around the unique mid-turn continuation behavior for long Pi tool runs.
- Replaced generic package keywords with Pi-required and product-specific tags for same-session resume, mid-turn/mid-run tool loops, context limits, compaction, handoff, and Continuation Ledger discovery.
- Updated the package gallery image URL to the v0.6.6 source tag.

## 0.6.5 - 2026-05-08

### Fixed

- Queued same-session resume prompts now use Pi `followUp` delivery and recognize the delivered continuation user message as resume-start proof, so active parent turns and tools cannot falsely trip the start timeout before the follow-up begins.

### Changed

- Requires Pi `0.74.0` or newer in README installation docs, matching the peer dependency contract.
- Updated the package gallery image URL to the v0.6.5 source tag.

## 0.6.4 - 2026-05-07

### Changed

- Added package-local TypeScript source typechecking to the release gate.
- Refreshed package-local dependencies to their latest pnpm-resolved versions.
- Updated the package gallery image URL to the v0.6.4 source tag.

## 0.6.3 - 2026-05-07

### Changed

- Aligned Pi runtime imports and peer dependency metadata to the `@earendil-works` Pi 0.74 package scope.
- Updated the package gallery image URL to the v0.6.3 source tag.

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
- Compaction metadata remains compact and path-free in the rendered summary, while explicit read-file and modified-file tags are controlled separately by `appendReadFileTags` and `appendModifiedFileTags`.

### Added

- Hard-fail tests proving synthesis/auth/parse/split failures do not send a continuation prompt and do not write `CONTINUE.md` or `AGENTS.md`.
- Strict v3 artifact and compaction-details tests for unknown keys, invalid optional fields, retired config keys, retired details versions, and stale fallback fields.
- Contract sentinel tests for rendered Continuation Ledger quality: no stale active slots, no duplicate semantics, no mandatory read-now headings, and no numeric read-route caps.
- Package dry-run coverage that verifies the npm candidate includes the public package corpus and excludes ignored local guides, tests, lockfiles, tarballs, and runtime state.

### Removed

- `extensions/continue/src/fallback.ts` and its deterministic fallback test suite.
- The package-level `fallbackMode` default, README/example documentation, status copy, command settings surface, and artifact status variant.
- Fragile parsing of provider error text for paths, tokens, and model references.
