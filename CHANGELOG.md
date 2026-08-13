# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Shared Arena round/take landings now hand the question to Arena: "Try this
  in Arena" (and "Open Arena" for signed-in visitors) opens the compose box
  with the shared prompt already filled in
- Arena full rounds can be shared as a public link (Shift+F or the header
  "Share round" action), landing on a compact all-takes page with scores and
  the winner flagged
- Arena full-session transcripts can be copied as structured JSON (Shift+K),
  matching the existing Markdown transcript copy with byte-for-byte parity
  between the copy and download formatters
- Agent Mode completed results can be copied (Shift+C) or downloaded as
  Markdown (Shift+D), and the full report can be downloaded as JSON (Shift+J)
- Arena winner take can be saved to or removed from the saved-takes library
  with a new round-header "Save winner" action or the Shift+S shortcut
- Sidebar "Select all" now stages every matching chat in one click (count is
  shown on the button), even when the list is collapsed to the five-chat
  preview, so bulk export, copy, pin, duplicate, and delete cover the whole
  filtered list without expanding first
- Sidebar resumable chats can be restored from exported JSON transcript
  archives (single chat or combined archive) as new resumable chats
- Sidebar selected chats can be exported as one combined full-session JSON
  transcript archive (machine-readable, with per-chat provenance)
- Sidebar selected chats can be copied to the clipboard as one combined
  full-session Markdown transcript archive
- Sidebar selected chats can be exported together as one combined full-session
  Markdown transcript archive (indexed by chat title, with session provenance)
- Sidebar resumable chat bulk copy: copy selected chats to the clipboard as Markdown
- Sidebar resumable chat bulk delete: select individual chats or all visible,
  then remove them with one confirmed request
- Sidebar resumable chat bulk pin/unpin: flip the pin flag for every selected
  chat in one request, with honest partial-failure reporting
- Sidebar resumable chat filter for pinned-only views (search and exports
  respect the filter)

### Fixed
- Shared round links harden long prompts with an expand/collapse control on
  the public page, reject malformed round-only URLs instead of falling back
  to a single-take card, and stay inside the 2000-character URL budget even
  when prompts or takes contain multi-byte text
- Arena round header distinguishes "Winner downloaded" from the save-winner
  action, and save/unsave feedback resets cleanly between rounds
- Sidebar "Clear chat selection" now empties the whole selection even when a
  search or pin filter hides some selected chats, instead of stranding hidden
  picks staged under a previous filter
- Chat archive import now survives archives with missing/null timestamps,
  honors a take flagged `is_winner` when the winner id is absent, and stays
  available even when the sidebar has no current chats (with active search
  filters cleared so restored chats are visible immediately)
- Combined transcript exports (Markdown and JSON) share one exported-at
  timestamp across the archive header/envelope and every included chat, and
  archive loading follows the fetched session id for provenance while
  deduplicating aliased selections
- Combined transcript copy/export archives sanitize the session-id heading
  fallback, so even unusual ids keep the Markdown well-formed
- Combined transcript export fetches selected sessions in bounded parallel
  batches, keeps partial archives when individual chats fail, and sanitizes
  chat titles so the Markdown archive stays well-formed
- Sidebar selected-chat copy is hardened against overlapping in-flight copies,
  announces the busy state, and reports singular/plural counts correctly
- Sidebar bulk chat delete reports partial deletions honestly and announces
  completion to screen readers
- Sidebar pinned-only chat filter safely falls back to all chats when the last
  pinned chat is unpinned, and stale filter values are normalized
- Resumable chat list export (Markdown, JSON, or CSV) from the sidebar with
  spreadsheet-formula-safe CSV cells
- Sidebar resumable chat sorting by newest, oldest, title, or most turns
  (pinned chats stay pinned above the chosen order)
- Sidebar chat sorting treats missing/invalid activity times and untitled
  chats as unknowns that stay at the end of the list
- Sidebar resumable chats can be duplicated as a fresh, independent fork
  (same transcript and title, new id, unpinned)
- Workflow security gate that enforces least-privilege permissions, job
  timeouts, no dangerous triggers or `secrets: inherit`, and
  `persist-credentials: false` on every checkout
- Full-session transcript copy (Markdown) so the whole conversation can be pasted without a file download
- Full-session transcript CSV export (one spreadsheet row per take, winner first)
- Full-session JSON transcript export (structured archive of every exchange and take)
- Full-session Markdown transcript export (download the entire conversation, not just the latest round)
- Usage history JSON export (14-day dated token rows plus period summary)
- Usage history CSV export (14-day daily token totals with a period summary footer)
- Activity timeline CSV export with per-mode daily counts and a rollup footer
- Activity timeline Markdown export (summary, streaks, and a per-day table for notes or docs)
- CI status badges to README.md
- SECURITY.md with vulnerability reporting guidelines
- CODEOWNERS for automatic code review assignment
- CONTRIBUTING.md with development guidelines
- Release workflow for version-tagged builds
- `workflow_dispatch` triggers for manual CI runs
- PR diff size check for large PR warnings
- Summary steps at end of CI jobs
- `X-Request-ID` tracing middleware (request IDs on every response)
- Request ID surfaced in prompt, debate, and discuss SSE streams
- Request ID included in non-stream prompt responses and admin health detail
- Request ID included in Agent Mode run responses and frontend error messages
- Request ID included in Agent status/result frontend error messages
- Request ID included in Agent status poll responses
- Request ID included in Agent orchestration start responses
- Request ID included in Agent orchestration status responses
- Request ID included in Agent orchestration list responses
- Request ID included in Agent watchlist list responses
- Request ID included in Agent recent feedback responses
- Request ID included in Agent feedback submission responses
- Request ID included in Agent task cancel responses
- Request ID included in Agent orchestration cancel responses
- Request ID included in Agent task rename/delete responses
- Request ID included in Agent live-toggle responses
- Request ID included in Agent mark-read responses
- Request ID included in Agent live-updates responses
- Request ID included in Agent capabilities/capability-docs responses
- Request ID included in Agent capability examples/stats responses
- Request ID included in Agent capability-usage responses
- Request ID included in Agent single capability-doc responses
- Request ID included in Agent calibration responses
- Request ID included in Agent task feedback responses
- Request ID included in Agent watchlist history responses
- Request ID included in Agent orchestration frontend errors
- Request ID included in Agent export frontend errors
- Request ID included in feedback submit frontend errors
- Request ID included in Agent upload frontend errors
- Request ID included in saved-response delete frontend errors
- Request ID included in saved-response save/pin frontend errors
- Request ID included in saved-response list frontend errors
- Request ID included in persona/panel frontend errors
- Request ID included in memory frontend errors
- Request ID included in watchlist frontend errors
- Request ID included in feedback history frontend errors
- Request ID included in scoring audit frontend errors
- Request ID included in agent task detail frontend errors
- Request ID included in agent task action frontend errors
- Request ID included in prompt improve frontend errors
- Request ID included in templates frontend errors
- Request ID included in follow-up suggestion frontend errors
- Request ID included in calibration frontend errors
- Request ID included in auth frontend errors
- Request ID included in profile/usage frontend errors
- Request ID shown in Arena, Discuss, and Debate stream error messages
- “Try again” button in the Arena error banner for quick retries
- “Try again” button in focused-chat error banners for history-safe retries
- Copy error buttons in Debate Mode error banners
- Copy error button in Agent Mode banner
- “Try again” button in Agent Mode banner
- “Try again” buttons in Debate Mode error banners

### Changed
- Workflow security gate now also rejects empty action refs and mutable
  non-branch tags like `canary`, `nightly`, and `dev`
- Workflow security gate now also rejects wildcard `write-all`/`read-all`
  permissions, mutable third-party action refs, and comes with negative unit
  tests for every invariant it enforces
- Full-session transcript copy now prevents overlapping copy attempts and the
  clipboard fallback always cleans up its temporary textarea, even on failure
- Resumable chat export now escapes markdown-sensitive user text and writes
  CSV with a UTF-8 BOM and CRLF records for spreadsheet compatibility
- Activity Markdown export now escapes table cells and is covered by window-boundary,
  caller-isolation, row-order, and report-structure regression tests
- JSON session transcript export now pins a format version, drops stale
  winner ids that match no stored take, and falls back to agent ids when a
  persona cannot be resolved
- Markdown session transcript export now includes the session id, per-exchange
  timestamps, and an empty-exchange fallback, and normalizes multi-line prompts
  and one-liners for portable archives
- Usage JSON export preserves the server's date-ranged filename and uses the
  shared Content-Disposition helper
- Profile export section label now covers JSON and CSV data exports
- Usage history CSV export now runs a single aggregation pass (no duplicate
  day-history query) and computes day boundaries in naive UTC, matching the
  codebase's timestamp convention on SQLite and Postgres
- Activity timeline CSV export shares the JSON endpoint's aggregation helper,
  so exporting no longer consumes the JSON endpoint's rate-limit budget
- Repaired CodeQL action tag after an invalid v5 bump (now pinned to v4)
- Upgraded actions/checkout from v4 to v7
- Optimized Dependabot schedule to daily security checks
- Updated postcss pin floor to 8.5.23 (security fix)
- Bumped cryptography to 50.0.0 and postcss to 8.5.26 (security fixes)
- Exposed `X-Request-ID` through CORS for browser clients
- Release workflow now enforces the npm audit HIGH/CRITICAL gate and no longer
  ships `backend/arena.db` in release artifacts

### Security
- Scheduled dependency security scan now also runs `pip check` so dependency
  resolution inconsistencies are caught on the same recurring cadence as the
  vulnerability scan
- Added a scheduled dependency security workflow that runs `pip-audit` and
  `npm audit` weekly (plus on-demand via `workflow_dispatch`) so newly
  disclosed vulnerabilities are caught even without a code change
- Workflow security gate now enforces minimum version floors for
  security-critical GitHub Actions, so a downgrade below a known-good major
  version cannot silently regress CI or CodeQL
- Release workflow now runs the same workflow-security gate as CI so a
  release cannot ship from a workflow that violates the hardened GitHub
  Actions invariants
- Hardened client-side Arena CSV exports (single-round and full-session
  transcript) against spreadsheet formula injection (CWE-1236)
- Added gitleaks allowlists for test fixture API keys
- Fixed npm audit vulnerabilities (brace-expansion, js-yaml, postcss)
- Added comprehensive security floor guards for Python and Node.js
- Hardened release artifacts against accidental database/PII leakage
- Added a CI source-integrity guard that fails on stray bare `main` tokens,
  catching paste corruption before it breaks backend imports or frontend builds
- Added a regression test that locks the CI source-integrity guard in place
- Added a focused CodeQL config that ignores tests/build/generated paths so
  the security analysis stays on production code with less noise
- Extended workflow YAML validation to cover the CodeQL config file
- Expanded the PR template security checklist with dependency review, CodeQL,
  source-integrity, and workflow YAML validation checks
- Documented the expanded CI security gates in CONTRIBUTING.md
- Added a CI style job that enforces `git diff --check` on PR/push diffs
- Tightened the style-job regression test to verify the full-history checkout
- Added `pip check` to the backend CI job to catch dependency inconsistencies
- Documented the `pip check` gate in the PR template and CONTRIBUTING
- Added CODEOWNERS review coverage for CI/security config and tests
- Added a regression test that locks the CODEOWNERS security coverage in place
- Documented pip check, source-integrity, git diff --check, and CODEOWNERS
  coverage in SECURITY.md
- Added a regression test that keeps SECURITY.md aligned with the CI gates
- Fixed the malformed Dependabot config (now a valid `version: 2` file) and
  added a regression test that keeps it valid
- Extended the CODEOWNERS coverage test to include the Dependabot config
- Added `pip check` to the release workflow dependency consistency gate
- Tightened the release pip-check regression test to verify the backend
  working-directory
- Added a CI job that runs pre-commit hooks and fixed the pre-commit YAML
  (`@`-prefixed dependency pins and venv-scanning debug hook)
- Documented the pre-commit CI enforcement in PR/contributor/security docs
- Skipped CodeQL on markdown/design-only pushes and PRs to keep analysis
  focused on code changes
- Extended the CodeQL skip regression test to cover all ignore patterns and
  the weekly scheduled scan
- Added a manual `workflow_dispatch` trigger to the release workflow
- Strengthened the release trigger regression test to keep v* tag pushes intact
- Skipped CI on markdown/design-only pushes and PRs to save runner time while
  keeping all code and CI checks active

## [0.1.0] - 2026-08-07

### Added
- Initial release with multi-AI agent chatroom functionality
- 16 AI personas with distinct reasoning styles
- Backend: FastAPI with SQLAlchemy, Alembic migrations
- Frontend: React 18, TypeScript, Tailwind CSS, Vite
- Agent Mode with 8-stage research pipeline
- Debate and Discuss modes
- Watchlist, Saved responses, Rooms features
- Razorpay subscription support
- Model Context Protocol (MCP) integration
