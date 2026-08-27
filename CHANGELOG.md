# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- Bulk Agent history deletion now reconciles already-missing selections in the
  current tab immediately, keeping stale rows and local pins from lingering

### Added
- Agent research history can now export exactly the selected tasks as a
  spreadsheet-safe CSV file, including selected rows hidden by filters
- Agent research history can now export exactly the selected tasks as a dated
  JSONL file, including selected rows that are temporarily hidden by filters
- Agent research history now supports deleting selected tasks together, with
  an explicit inline confirmation, bounded server-side deletion, safe
  ownership scoping, and honest partial-success feedback
- Agent research history now supports selecting visible tasks and pinning or
  unpinning the selection together, with a browser-local 50-pin cap and safe
  cleanup when retained history changes
- Agent research history now remembers its sort and filter view across visits,
  while validating browser-local preferences field by field so stale or
  corrupted values fall back safely without persisting free-text searches
- Agent history can now filter the retained research list to browser-local
  pinned tasks, with the filter reflected in counts, empty states, and exports
- Agent history rows now show a source badge for standalone, watchlist, and
  orchestration research, so task provenance is visible without applying a
  filter or opening the task
- Agent history can now filter by source — standalone research, watchlist
  runs, or orchestration tasks — and carries that choice into the filtered
  count, empty state, and all history exports
- Agent history can now copy the current filtered view as JSONL, placing one
  stable task object per line on the clipboard for quick handoff to terminals,
  notebooks, and import tools
- Agent history can now download the current filtered view as JSONL, with one
  stable task object per line for streaming into command-line tools
- Agent history now has a Copy CSV action for the current filtered view,
  preserving spreadsheet-safe escaping and the UTF-8 marker used by CSV
  downloads while also exposing a plain-text clipboard fallback

### Improved
- Selected Agent history CSV downloads now guard serialization as well as the
  browser trigger, so malformed runtime rows report a failure without leaving
  the export action locked
- Selected Agent history JSONL export now ignores rapid repeat activation and
  reports its in-progress state, preventing duplicate downloads and locked
  controls after malformed runtime data
- Restored Agent history topic, source, and pinned-only views now wait for a
  successful history load before being reconciled, so a slow first visit or
  an empty history response cannot erase or retain the wrong filter
- Agent history pins and the pinned-only filter now stay synchronized across
  open browser tabs, and storage clears or malformed updates safely reset the
  view instead of leaving stale pinned rows visible
- Agent history source filtering now fails open to the complete history when
  stale or unknown runtime filter state is encountered, instead of presenting
  an unexplained empty view
- Filtered Agent history JSONL copy now avoids empty clipboard writes and
  reliably falls back to plain text when rich NDJSON clipboard support is
  unavailable or rejected
- Agent history CSV exports now trim topic labels and ignore malformed runtime
  topic values, while structured CSV clipboard writes retain a plain-text
  fallback when the browser rejects the richer MIME payload
- Agent history JSON clipboard copying now locks repeat activation, reports an
  in-flight state, and ignores late clipboard completions after reset or unmount
- Watchlist bulk removal now locks visible selection and every other watch
  mutation until the destructive request settles, preventing a rapid second
  action from racing the deletion or changing the confirmed selection
- Watchlist manual re-checks now serialize with each other: while a selected
  burst is starting, card-level run, pause, cadence, edit, duplicate, and
  delete controls stay locked so a stale item update cannot race the new task;
  the same guard covers Run all and individual Run now actions
- Accuracy verdicts can explain themselves now: choosing a verdict
  reveals an optional note (1,000 characters, saved explicitly with a
  dirty-aware "Note saved" marker that disappears the moment the text
  diverges) — and every verdict change carries the current note along,
  because the backend overwrites feedback and note together and a
  noteless POST would silently erase what you wrote. The control also
  moved into its own tested component instead of living inline in the
  agent page
- The prompt-pipeline status now owns its freshness: every reading
  carries how old it actually is ("checked 40s ago") instead of an
  undated green dot that could sit stale all afternoon while claiming
  health — and a missing or unparseable server timestamp renders no
  age claim at all rather than inventing one
- Contradiction reports communicate their states properly: the
  region now announces loading/result/refusal swaps to screen readers
  via aria-live, and a refused load offers an explicit Retry button —
  matching the capability-reference precedent — instead of hiding
  recovery behind collapse-and-re-expand
- The agent-memory card reads honestly at the edges: runs that hit
  the backend's 100-character slice are marked with an ellipsis
  instead of stopping mid-word as if complete, and a refused load
  takes keyboard focus onto its verbatim refusal — same contract as
  the profile-save error
- Execution facts are now actually hearable: the condura/heartbeat
  line moved outside the expand toggle, whose aria-label was masking
  it from screen readers entirely — and heartbeats render in human
  units ("stream heartbeat 10m", exactly what the stats endpoint's
  docstring imagined) instead of raw "600s"
- Security details read like a profile, not a database: member-since
  and last-active render as human dates ("15 Jan 2026") matching the
  billing rows instead of raw ISO slices, an unparseable server date
  falls back to what was sent rather than "Invalid Date", and a
  refused load moves focus onto the refusal itself — keyboard and
  screen-reader users land on the reason, same contract as the
  profile-save error
- Test-search results are tidier and safer: Notion results echo their
  own URL as the excerpt, so that duplicate line is suppressed rather
  than printing the same link twice; a result URL only becomes a link
  when it's actually http(s) — vendor payloads can never render as a
  javascript: href — and the region announces its busy state via
  aria-busy so screen readers aren't left guessing during a search
- Try-it prompts now wrap instead of truncating behind an ellipsis —
  you can actually read the full prompt before copying it — and the
  "Copied" flash carries aria-live so assistive tech announces the
  confirmation too
- Capability docs read like docs now: the markdown the registry
  returns renders as headings, bullets, bold text, and inline code
  spans instead of literal asterisks in a monospace pre block — no
  new dependency, just the subset the registry actually uses. The
  taxonomy list is alphabetized client-side to match the sibling
  docs endpoint's stable order
- The capability usage card now counts every call: the server's
  totals skip 'other'-mode rows entirely, so the headline is computed
  from the full mode split instead — and each nonzero mode shows as a
  chip (12 agent · 5 arena · 2 other) rather than collapsing into one
  web number. Bars carry image roles with per-category counts so the
  proportions read without sight
- Deleting a calibration rating now keeps pagination honest: removing
  a row can empty the tail page outright (five ratings to a page), so
  a delete that falls out of range drops back to the last page that
  still exists, and any other delete quietly re-reads the current
  page — rows and totals come back from the server instead of
  trusting a locally edited copy that time would drift
- Recent handoffs can now be refreshed in place: statuses move
  server-side (the reconciler retires stale streams), so the section
  header carries a Refresh button that re-reads the list and drops
  cached timelines — an expanded row collapses rather than show
  events it no longer trusts. A refused refresh surfaces its reason
  verbatim and keeps the loaded rows

### Added
- Agent history can now copy the current filtered view as structured JSON
  directly to the clipboard, preserving the same filter note and stable field
  names as its JSON download for quick handoff to scripts and notebooks
- Agent history can now be exported as full retained-task JSONL from the
  sidebar. The streaming export stays separate from the paginated, filtered
  view, downloads a dated file, and locks its action while the request is in
  flight so large histories remain useful to command-line tools without
  pretending the visible page is the whole archive
- Watchlist bulk actions now have a "Select visible" control that selects or
  clears only the watches in the current filtered view, preserving selections
  outside that view as filters change
- Watchlist selections can now be re-checked on demand: select any mix of
  active and paused watches and use "Run selected" to start only those
  questions, with the same bounded concurrency, rate-limit handling, and
  honest per-burst outcome summary as the existing Run all action
- Completed runs can now be marked for accuracy, not just rated: an
  Accurate / Partially accurate / Inaccurate control sits beside the
  calibration rating on every finished answer — wired to the feedback
  endpoint that never had a caller, applied optimistically and rolled
  back on refusal, with refusals shown verbatim plus their request ID.
  The history filter could already filter by these verdicts; until
  now nothing in the UI could produce one
- A live prompt-pipeline status now sits beside the composer: the
  readiness probe (dormant until now) reports db/memory/route health
  as a quiet green or red line above the research-task input, a 503
  is parsed as degraded data naming the failing checks rather than
  swallowed as an error, and Refresh and Retry are both explicit —
  with status swaps announced via aria-live
- Rated runs now confess their contradictions: each rating in the
  recent-feedback list gains a "View run detail" expander backed by
  the task-detail endpoint that never had a caller — open
  contradictions render with severity and an "open/resolved" state,
  direction reads as prose ("This run shifted your earlier stance:
  …"), an empty report says so plainly, refusals retry on re-expand,
  and reports cache for the modal's life
- The Memory page now shows what the agent itself leans on: a new
  "Agent memory" card calls the dormant memory-context endpoint and
  lays out your run count, recurring topics as chips, the last five
  runs with scores (unscored says so), and any contradictions Arena
  still believes are open — severity included. An empty history
  states plainly that there is nothing to remember, and refusals land
  verbatim with their request ID
- Capability rows now say how they actually run: the registry-stats
  endpoint (dormant until now) feeds condura method and stream
  heartbeat facts into the capability reference — "condura POST ·
  stream heartbeat 600s" appears on the collapsed row itself, only
  for capabilities that have those facts, and a failed stats fetch
  quietly leaves the plain reference intact rather than alarming
  anyone over metadata it never promised
- The Account tab finally tells you where you stand: a Security
  details expander calls the account-security endpoint that was built
  for this panel but never had a frontend caller — member since, last
  active (nulls say "no activity recorded yet" rather than a fake
  dash), verification status, and the honest password story: original
  since signup, last-changed date once tracking ships, or "not set —
  linked provider". Details fetch once per modal open and are cached,
  and a refusal surfaces verbatim with its request ID
- Connected integrations can prove themselves: each connected row in
  the Integrations tab gains a Test search expander that runs a live
  query against the vendor (Notion, GitHub, Google Drive) through the
  endpoint that had no frontend caller — results render as titled
  links with source badges, a refusal surfaces verbatim inside the
  row, and an empty result set says exactly that instead of posing as
  success or failure
- Capability docs now come with a "Try it" row: each expanded
  reference entry lists that capability's curated example prompts —
  from the endpoint built for a chip row that never shipped — with
  one-click copy and a "Copied" flash. A capability without curated
  examples stays quiet, and if the examples read fails the section
  says so at its bottom while docs keep working
- A capability reference lives beside the usage card: one expander
  lists the full capability taxonomy (id, one-liner, execution
  badge) from the public endpoint that had no frontend caller, and
  expanding any row fetches its long-form markdown doc once and
  caches it across collapses. A refused doc surfaces verbatim inside
  its own row while the taxonomy list stays intact
- The Usage tab now answers "which capabilities do I actually
  exercise?": a Capability usage card reads the per-capability call
  counts endpoint that had no frontend caller, with a 7/30/90-day
  window switcher, agent-vs-web totals for the window, and a bar per
  prompt category sorted heaviest first. A refused load surfaces its
  reason verbatim with a Retry, and an empty window says so plainly
- Calibration history rows can now be deleted: each rating carries a
  confirm-gated Delete control ("Delete forever?" → Confirm/Keep),
  and the row leaves the list only after the server accepts — the
  total shrinks in place while the stats panel re-reads and
  recalibrates itself. A refusal (unknown task, hourly delete limit)
  surfaces verbatim above the list and the row stays put. Wiring the
  DELETE /api/calibration/rating/{task_id} endpoint, which had no
  frontend callers at all
- Dispatched handoffs are no longer invisible after sending: the
  Condura dialog lists your recent recorded handoffs with their live
  status (colored by outcome — complete green, failed/cancelled/
  stream-lost red, in-flight amber), and expanding one fetches its
  event timeline (started → progress → complete…) once and caches it.
  Wiring the GET /handoffs list and detail endpoints that had no
  frontend callers at all

### Improved
- Saved-handoff rows now admit when their link has aged out: every
  handoff is signed with a 24-hour window, so drafts past it show a
  "signature expired" marker and the copy button explains itself on
  hover instead of quietly handing over a dead condura:// link

### Added
- Saved handoffs can now be recovered: the Condura dialog lists the
  handoff drafts you've saved (labeled by their intent summary with
  capability and age), rebuilds each one's condura:// link from its
  stored payload so it can be re-copied on any device, and deletes
  drafts behind an inline confirm — wiring the list and delete
  handoff-draft endpoints that had no frontend callers at all

### Improved
- The end of the saved-discussion history is now legible: a census
  line under the list reads "Showing X of Y saved discussions" while
  pages remain and "All Y saved discussions shown" once pagination
  has run its course (single-page histories stay silent). It's a
  role="status" live region, so screen readers hear each page land

### Added
- Saved-discussion history now paginates: the drawer's "Load more"
  button — showing how many older threads remain, e.g. "Load more
  (12 older)" — walks the list endpoint's page param that had been
  sitting unused alongside search and agent_id. Older pages append
  only after the server answers, re-send the active filters, retire
  the button once everything is shown, and a refused page surfaces
  its reason verbatim without losing what's loaded

### Improved
- The saved-discussion history now speaks one language: known agents
  appear by their human names ("The Analyst") in row metadata and in
  expanded message labels — matching the filter chips instead of raw
  ids like claude-sonnet, which remain only as fallback for unknown
  senders

### Added
- Saved discussions can now be filtered by agent: the history drawer
  renders one chip per known agent (plus "All agents") wired to the list
  endpoint's agent_id param that had been sitting unused alongside
  search. Chips commit instantly, compose with an applied title search,
  and an agent with no saved threads says so — with a one-click way back

### Improved
- Search refinement no longer dead-ends: an applied search shows how
  many threads it matched, and the input survives into the no-match
  state so a new query needs no clear-then-retype detour

### Added
- Saved discussions are now searchable: the history drawer's title
  search commits on Enter (the filter editors' keyboard contract) and
  hits the list endpoint's search param that had been sitting unused.
  A Clear chip tracks the applied filter, a no-match state names the
  query it found nothing for, and Escape lifts the search before it
  ever closes the drawer

### Improved
- Continuing a saved discussion mid-reply no longer silently no-ops:
  the Continue button disables itself with its reason ("Wait for the
  reply to finish…") until the stream ends, matching the rule that a
  disabled control explains itself

### Added
- Saved discussions are no longer read-only: an expanded thread offers
  "Continue this discussion", seeding its messages back into the live
  chat — and handing off to the saved thread's agent first when it
  differs from the active mind. Continuing is blocked mid-stream so an
  in-flight reply's conversation history can't be corrupted

### Improved
- Deleting a saved discussion no longer happens on a single click:
  since the server has no undo, the first click only arms an inline
  "Delete forever? Confirm / Keep" step (opening another row or keeping
  disarms it). The drawer also closes on Escape from within, and its
  region is labeled for screen readers

### Added
- 1-on-1 discussions can now outlive the chat: DiscussMode grows a Save
  thread button and a History drawer backed by the discuss-thread API
  that had been sitting dormant server-side (list with pagination,
  full-thread hydrate, delete). Titles derive from the original prompt,
  threads expand read-only in place with their starting context, deletes
  only land after the server accepts, and every refusal — tier gating,
  delete rate limits — surfaces verbatim with its request ID

### Fixed
- Duplicate presets no longer drift away from their original: the copy
  used to take the neighbor's slot (original position + 1), letting the
  list's updated_at tiebreak reorder it elsewhere after any later edit.
  Duplicating now shifts everything at or after the slot down one in the
  same transaction, so the copy always sits directly under its original

### Added
- Presets can now be duplicated from the sidebar panel: a Duplicate
  button reaches the backend's previously-unreachable duplicate route,
  which names the copy "<original> (Copy <timestamp>)" and slots it
  after the original. Since the copy is the server's invention, the
  panel refetches rather than guessing its row, and refusals (the
  preset cap, tier gating) surface verbatim with their request IDs

### Improved
- The filter editor now honors the keyboard contract the rename editor
  established: Enter commits from any of its inputs (search box, sort
  select, score bounds) and Escape cancels without touching the server

### Added
- Preset filters are now editable from the sidebar panel: a Filters
  button opens an inline editor prefilled from the row (search term,
  score bounds, sort order), and saving PUTs only the touched fields.
  The backend update route learned to let filters go — a blank search
  string now clears the term and explicitly-null score bounds remove
  them (absent fields still leave values untouched) — because without
  that, no preset could ever shed a filter once saved. Failed saves
  keep the editor open with the draft intact

### Fixed
- Three honesty gaps in the presets panel: a restore that partially
  failed now says so ("N rows couldn't be imported") instead of
  reporting only the successes; downloading a preset updates its
  "used Xm ago" stamp immediately instead of leaving it stale until the
  next refetch; and the disabled Back up button explains itself at zero
  presets ("Nothing to back up yet") instead of just being inert

### Added
- Export presets can now be backed up and restored: a Back up button
  downloads the backend's versioned JSON envelope as a dated file, and
  Restore accepts it (or any JSON with a presets array) back through the
  import endpoint. The server's honest bookkeeping surfaces in the UI —
  imported counts, duplicate names getting an "Imported" suffix instead
  of silent overwrite, the preset-limit refusal shown verbatim — and
  malformed or empty files are rejected client-side before anything is
  sent. The list refetches after a restore since ids and positions are
  the server's to assign

### Improved
- Bulk-delete selection gets real ergonomics: All and None buttons keep
  the selection one click away from complete or empty (and disable
  honestly at exactly those states), the "N selected" count is a polite
  live region so screen readers announce every change, and Escape on any
  checkbox leaves selection mode — the same contract the inline rename
  editor honors

### Added
- Export presets can now be deleted in bulk: a Select toggle in the panel
  header swaps per-row actions for checkboxes, with a live "N selected"
  bar and a disabled-at-zero Delete button. The backend's guardrail is
  surfaced honestly — if the selection includes your default preset, the
  refusal renders as an alert and the bar switches to an explicit
  "Delete anyway" second click (retrying with force=true) instead of
  silently bypassing protection or failing mysteriously

### Improved
- Export preset rows now show when each was last downloaded ("used 5m
  ago") beside their filter summary — the backend has always stamped
  last_used_at on every download, but the UI never surfaced it, so there
  was no way to tell which presets earn their place. Never-used presets
  show nothing instead of a dangling label

### Added
- Export presets are now reorderable from the sidebar panel: every row has
  Move up / Move down controls that persist the new order through the
  backend's reorder endpoint (list index becomes the saved position), so
  the arrangement survives reloads. The swap only commits after the server
  accepts it — a failed move restores the previous order and surfaces the
  reason — and the edge rows' buttons disable honestly instead of lying
  about moves they can't make

### Improved
- Export presets now honor the backend's one-default-per-user rule in the
  UI: the current default wears a Default badge, every other row offers a
  one-click Make default action, and switching moves the badge in place
  without a refetch — failures surface honestly and leave the badge where
  it was

### Added
- Export presets can now be renamed inline from the sidebar panel (the
  backend's update route finally has a frontend surface): a Rename button
  swaps the name for an editor with Save/Cancel, Enter commits and Escape
  cancels, blank drafts can't be saved, failed renames surface the server
  message with the draft intact, and the row updates in place on success

### Improved
- The export-preset dry-run preview now describes itself: the effective
  sort order (newest first, highest score first, pinned takes first, or
  oldest first) and any search term the server actually applied render
  beside the match count, so the preview matches what the download will
  do even when a preset was saved with unusual settings

### Added
- Export presets now show a dry-run preview before downloading: each row
  has a Preview toggle that counts the exact takes the export would return
  (via the backend's read-only dry-run endpoint) and samples the top few
  with their mind and score — fetched lazily per preset, cached so
  re-opening never refetches, collapsing honestly on failure

### Added
- Export presets are now surfaced in the sidebar's saved-takes section: a
  new panel lists each preset with its format and filter summary,
  downloads it in one click through the backend's redirecting use
  endpoint, and deletes it — with per-action busy states, honest
  success/failure feedback, a retry on load failure, and template
  quick-add chips when no presets exist yet

### Added
- Export presets now have a complete typed frontend API layer (list,
  template catalog, create-from-template, delete, and one-click download
  via the backend's redirecting use endpoint) with input validation,
  request-ID passthrough, and server-filename envelopes — the groundwork
  for surfacing saved-response export presets in the UI

### Improved
- The persona drill-down's category breakdown now ships a clipboard copy
  alongside its CSV and Markdown downloads ("Copy Category Breakdown
  Markdown"), matching the timeline family's full download/copy matrix;
  the backend Markdown report also pins escaping tests so freeform
  category labels cannot break table layout or smuggle Markdown into a
  pasted report

### Added
- Persona drill-downs can now export a mind's per-category breakdown as a
  human-readable Markdown report (summary rollup, category table, and the
  fallback-wins honesty note), completing the by-category export family
  alongside CSV — new backend route with its own rate-limit scope, frontend
  helper following the envelope pattern, and a second drill-down button that
  follows the selected persona-stats window

### Improved
- Persona stats overview exports (CSV download, JSON download, Markdown
  download, CSV clipboard copy) now follow a selected persona-stats window
  instead of a hardcoded 30 days; the selector sits beside the summary and
  usage windows and stays locked while an export is in flight

### Improved
- The persona drill-down's category breakdown export now matches its
  timeline siblings: plain action label, and a deferred-export test pins
  the full busy lifecycle so the button can never read available while a
  download is in flight

### Added
- Persona drill-downs in profile analytics can now export a mind's full
  per-category breakdown as CSV (category rows with appearances, wins, and
  win rate plus a rollup footer), following the selected persona-stats
  window with honest failure feedback — surfacing the previously
  API-only export route in the UI
- Profile analytics can now copy the complete persona-stats overview as
  structured JSON straight from the dashboard for notebooks and scripts,
  following the selected persona-stats window, with honest clipboard-
  failure feedback — completing download/copy parity across all three
  overview formats
- Profile analytics can now copy the complete persona-stats overview as a
  human-readable Markdown report straight from the dashboard, following the
  selected persona-stats window, with honest clipboard-failure feedback
- Profile analytics can now copy the complete persona-stats overview as
  spreadsheet-aware CSV straight from the dashboard, with honest clipboard-
  failure feedback matching the other persona stats exports

### Fixed
- The category-stats CSV, persona timeline CSV, and by-category CSV exports
  no longer strip the server request ID from rate-limit and error messages,
  making support diagnostics actionable across every export route in the app
- CI is green again on main after three independent breakages: the backend
  security pin-floor guard no longer dies to bash command-substitution on its
  own comment text (extracted to scripts/check_security_floors.py), fifteen
  export-helper tests use a shared cross-realm Blob assertion instead of
  spuriously failing `toBeInstanceOf(Blob)` checks, and a stray blank line at
  EOF no longer trips the whitespace/pre-commit gates
- The persona stats overview CSV export no longer fails silently: download
  failures surface the server error with its request ID, blocked downloads
  report why, and saved files use the server-provided filename instead of a
  hardcoded one

### Added
- Persona timeline JSON clipboard copy now ignores duplicate activations while
  an export is still in flight, preventing redundant requests and stale results
- Profile analytics can now copy each persona's daily activity timeline as
  structured JSON for scripts and notebooks without leaving the dashboard
- Profile analytics can now copy each persona's daily activity timeline as
  spreadsheet-aware CSV without leaving the dashboard
- Profile analytics can now download each persona's daily activity timeline
  as a portable Markdown report with a summary, daily table, and export footer
- Profile analytics can now download or copy the filtered weekly persona
  win-rate trend as a portable Markdown report, including empty-week and
  omitted-history honesty notes
- Profile analytics can now copy the filtered weekly persona win-rate trend
  as spreadsheet-aware CSV, preserving the selected window, minimum sample,
  and fallback-scoring filters
- Usage persona win-rate JSON reports can now be copied to the clipboard with
  the selected window, minimum sample, and fallback-scoring filters
- Usage persona win-rate reports can now be copied as structured CSV for the
  selected window, minimum sample, and fallback-scoring filters
- Analytics summary reports can now be copied as Markdown for the selected
  window, with honest clipboard-failure feedback
- Usage activity timeline reports can now be copied as Markdown for the
  selected activity window, with honest clipboard-failure feedback
- Usage category performance reports can now be copied as Markdown for the
  selected activity window, with honest clipboard-failure feedback
- Usage now shows category performance for the selected activity window,
  including round counts, wins, win rate, and the best-performing mind, with
  honest loading, empty, retry, and malformed-response handling; category CSV
  exports now follow that selected window and report download failures
- Memory summaries can now be filtered by session kind or trusted mind from
  the Memory page; CSV and JSON exports follow the active filters
- Memory summaries can now be exported from the Memory page as CSV or JSON;
  exports follow the active search so users can take a focused slice or their
  complete saved memory with them
- Arena now has a Memory page (`/memory`, also linked from the in-app
  sidebar for Plus users): browse, search, and page through the compressed
  summaries Arena has saved about past sessions, open a summary to read the
  full session text and the key positions you took, and forget individual
  memories with a confirmed delete — surfacing the existing memory store
  that previously had no user-facing view
- Arena rounds now show why the judge picked the winner: the scorer's
  plain-text rationale rides along on every round payload and appears as a
  collapsible "Why this mind won" disclosure under the cards grid, and stays
  hidden whenever scoring fell back so users never see an empty widget
- Arena rounds also surface the judge's full scorecard: a collapsible
  ranking of every take with proportional score bars appears above the
  winner rationale, highlighting the winning mind with a crown, and stays
  hidden whenever scoring fell back to flat default scores so the panel
  never shows a hollow ranking

### Improved
- Persona timeline CSV copy now ignores late responses after the drill-down is
  closed or refreshed, so stale feedback cannot leak into a newer view

### Fixed
- Profile persona win-rate filters now stay locked while a filtered report is
  being copied or downloaded, so the visible selection cannot drift from the
  export in flight
- Persona win-rate CSV export and clipboard failures now preserve the server
  request ID, making rate-limit and support diagnostics actionable
- Profile analytics exports now keep the activity window locked while a
  category report is being fetched, so copied Markdown cannot lag behind the
  window the user selected
- Memory filter changes now release a pending older-page spinner immediately,
  so a stale pagination request cannot make the refreshed view look disabled
- The Memory page no longer swallows pagination failures: a failed
  "Load older memories" request now shows the error with a retry action
  while keeping the already-loaded summaries on screen, and the page stops
  offering older pages once an append returns no rows (deleting summaries
  can shift the server's offset, which previously left the button offering
  endless empty pages); failed deletes keep the summary visible and report
  why, and a failed summary detail load retries when the card is re-expanded
- The judge's scorecard crowns the same take the rest of the app does: an
  explicit winner flag first, then the round's winner id, then the top score,
  so imported rounds without flags no longer crown a different mind than the
  rationale below; raw scores are coerced and clamped to 0-100 so the label
  and bar can never disagree, unusable scores are dropped instead of
  misranked, and each row announces its place and score unit to screen readers
- The judge's rationale now rewrites internal `agent_1`–`agent_4` slot ids to
  the persona names shown on the cards, and the disclosure keeps its body in
  the DOM (hidden while collapsed) with a per-instance id so `aria-controls`
  always references a live, unique element
- Arena Discuss threads can be sent into Agent Mode for deeper verification
  (Verify in Agent Mode or Shift+V): the focused mind's latest reply — or the
  seeded take before any replies — becomes a fresh research task with the
  original question, reusing the same honest Pro-tier bridge as the winner
- Watchlist supports multi-select bulk removal: tick the checkboxes on several
  watches and use "Remove selected (N)" to clear them in one confirmed request,
  with honest partial-success reporting when some ids have already gone
- Watchlist exports every completed latest result in the current view as a
  markdown digest file (Download digest, Shift+M), mirroring the existing
  Copy digest action with the same completed-only, filter-aware content
- Watchlist cards can publish and copy a public link to the latest completed
  result without leaving the list, and re-copy an already-shared link instead
  of minting a new one
- Public shared Agent reports offer Copy report and Download .md, so
  visitors can take the full markdown report without signing in
- Completed Agent Mode reports can be published as public share links
  (Share report in the result toolbar): the link copies to the clipboard,
  opens a sanitized public report page at /share/agent/:token, and can be
  revoked at any time so old links stop resolving
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
- Discuss-thread Agent verification now normalizes its bridge payload the
  same way the Arena winner path does: long replies/questions are capped at
  the backend's 2000-character limit, persona labels at 100 characters, and
  non-finite scores are coerced to zero, so a large take can no longer be
  rejected by validation; the empty-thread warning also clears as soon as a
  reply lands instead of lingering after the thread becomes verifiable
- Watchlist bulk removal now re-syncs header counters from the delete
  response instead of a follow-up list fetch, so a successful deletion can
  never be misreported as a failure when the refetch flakes, and the
  partial-success message says "could not be removed" to cover both vanished
  and non-owned ids honestly
- Watchlist cards only offer to publish or copy a link for completed latest
  runs, so in-progress or failed results no longer show a share action the
  API would reject
- Shared Arena handoff clears any previously staged question when a share
  link carries no prompt, so opening Arena from a prompt-less or expired
  share landing can never prefill an older question
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
