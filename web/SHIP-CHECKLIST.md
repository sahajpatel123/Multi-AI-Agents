# Arena ship checklist (web FE + BE)

Short ops + verify list for production. Condura daemon shipping is **out of band** — Arena only integrates.

## Upgrade themes (v0.7 — July 2026)

- **Primary flows wired**: authenticated nav → Arena / Agent / Watchlist; homepage Persona Library is live (not vaporware); Watchlist empty states lead to Agent.
- **Restrained motion**: shared `motion.ts`, CSS `prefers-reduced-motion`, focus-visible rings, Condura CTA enter animation, page-enter shell.
- **Honesty**: on-device → Condura CTA / 409; no browser computer-control claims; honesty gate stays behind `CONDURA_HONEST_REJECTION_ENABLED`.
- **Recovery UX**: branded error boundary with reload/home instead of raw stack dumps.
- **Ops**: `/api/condura/metrics` admin-gated via `ADMIN_EMAIL` (same gate as `/api/metrics`).
- **Agent idle**: recent research chips from task history (one-click re-compose).
- **Arena live stream**: cards show one-liner previews while SSE tokens arrive (not eternal shimmer); streams abort on navigate/new chat.
- **Silent failure fixups**: verify-in-Agent, room task actions, register redirect intent, clipboard fallback.
- **Share links work**: public `/share` route renders agent/prompt/response; copy uses shared clipboard helper.
- **Debate/Discuss reliability**: AbortSignal on exit; no double chrome around DebateMode.
- **404 + account shell**: unknown routes get recovery UI; `/account` never blanks out after modal close.
- **Honest status**: footer health indicator polls `/api/health`.
- **Offline awareness**: fixed network banner on `offline` / reconnect.
- **Discuss switcher restored**: switch minds mid-chat (mobile chips + desktop rail).
- **Arena chrome**: header account menu; Escape closes focused agent; “Copy all takes” markdown export.
- **Recent prompts**: last asks cached locally as chips for one-click re-run.
- **Quota honesty**: soft-block at 0 remaining with upgrade CTA; 429 stream errors are human-readable.
- **Keyboard**: `/` focuses Arena prompt; Esc closes focused mind.
- **Social share honesty**: X / WhatsApp / Email use the same public `/share` URL as Copy link (never `/app`).
- **Post-auth redirect**: only same-app relative paths; default `/app`; open redirects rejected.
- **Agent pipeline honesty**: marketing + Agent idle copy say **7 stages** (matches runtime status stages).
- **Footer health**: re-probes `/api/health` every 45s via shared interpreter.
- **Watchlist cadence**: change 24h / 3d / 7d in place on each card (no delete + re-add).
- **Agent compose budget**: live character counter (max 2000, matches API).
- **Personas modal**: Escape closes + body scroll lock; Agent answer Copy uses robust clipboard + feedback.
- **Debate**: optional 4th bonus round after three standard rounds (API + UI aligned).
- **Sign-in**: password-manager autocomplete + post-auth destination preview.
- **Arena prompt**: character budget (max 2000) matches server sanitize cap.
- **Pricing FAQ**: accessible accordion + Condura computer-control honesty item.
- **Recent prompts**: Clear all + right-click remove single chip (local only).
- **About page**: copy matches shipped product + Condura honesty (no “still in development” vaporware).
- **Document titles**: per-route browser tab labels (Agent, Pricing, Rooms, etc.).
- **Scroll**: route changes reset to top; hash links scroll to section (reduced-motion aware).
- **Sign-in errors**: role=alert, focused on failure, shared validation helpers.
- **Agent min length**: live “N more characters to run” hint + run-button titles.
- **Agent recent chips**: right-click hide + Reset chips (local dismiss, history kept).
- **Condura CTA**: safe install URL allow-list, alert errors, shared primary labels.
- **Agent cards**: shimmer / hover lift / thinking rotation / breathe dots / confidence bar honor reduced motion (helpers wired in AgentCard).
- **Debate end honesty**: after max rounds, only Back to Arena — no fake “Ask a follow-up”.
- **Upgrade modal a11y**: Escape closes (gated during Razorpay), dialog semantics, body scroll lock.
- **Clipboard consistency**: Room invite, Agent room link, and Condura handoff use shared copy helper + failure feedback.
- **Auth modal a11y**: dialog semantics, labelled title, tab roles, body scroll lock, alert on errors.
- **Room recovery**: empty-task board guidance; branded load-error with Retry; guest Sign-in CTA with redirect intent.
- **Templates modal**: body scroll lock while open/closing + initial focus on Close (Personas parity).
- **Discuss / Debate compose**: live 2000-char budgets matching server sanitize caps.
- **Legal honesty**: Privacy/Terms reflect Postgres + Razorpay (no SQLite / “no payment info” claims).
- **Leaderboard honesty**: rows use active panel persona names/colors; bars respect reduced motion.
- **User menu a11y**: Escape closes dropdown; aria-expanded / menu roles on account actions.
- **Protected routes**: redirect intent set in effect (not during render); share menu ARIA.
- **Native share**: system share sheet (`navigator.share`) when available; still uses public `/share` URL; focus first menu item.
- **MicroLoader / footer motion**: static loading label under reduced motion; footer anchors + breathe dots honor `prefers-reduced-motion`.
- **Watchlist recovery**: load failure ≠ empty state (Retry); two-step remove confirm; pause switch labels.
- **Agent pipeline loader**: CalligraphyLoader static path under reduced motion; stage progressbar + live status.
- **Share landing actions**: public `/share` can Copy take, Copy link, and system Share… when available.
- **Busy leave guard**: beforeunload warns during Arena streams and Agent run/refine/challenge.
- **Busy tab titles**: live document.title while Arena streams / Agent pipeline stages run.
- **Debate / Discuss streams**: beforeunload + busy tab titles; scroll-into-view honors reduced motion.
- **Network banner**: safe-area padding, reconnected dismiss, reconnect timer cleaned up on unmount.
- **Agent `/` focus**: press `/` to focus research compose or follow-up (shared slash-focus helper with Arena).
- **Discuss / Debate copy**: markdown thread export (Copy thread / Copy debate) with clipboard feedback.
- **Condura CTA modal**: body scroll lock + copy-timer cleanup; collapsible Arena prompt honors reduced motion.
- **Agent answer copy**: markdown export (question + answer) with success/failure feedback; Product Arena CTA sets sign-in redirect.
- **404 recovery**: shows attempted path; signed-in users get Arena / Agent / Watchlist; tab title “Not found”.
- **Sidebar recents search**: filter history by prompt/title with clear + empty match state.
- **Leaderboard copy**: session rankings as markdown table; UserMenu loading respects reduced motion.
- **Agent history search**: filter research history by title/task text (shared search helper).
- **Arena prompt motion**: border/waveform/send pulse honor reduced motion; `/` focus hinted in title.
- **Sidebar saved search**: filter bookmarked takes by one-liner, prompt, or persona.
- **Discuss / Debate `/` focus**: compose shortcuts + alert errors; stream dots honor reduced motion.
- **Keyboard shortcuts help**: press `?` on Arena / Agent / Discuss / Debate for a shortcuts panel; Arena errors are dismissible alerts.
- **Post-auth paths**: normalize `/arena` → `/app`; shortcuts panel locks body scroll and focuses Close.
- **Watchlist find**: search questions + Active/Paused filters with clear empty-match state.
- **Saved take copy**: sidebar bookmark rows can copy markdown (question + take).
- **Persona library search**: find minds by name/quote/description; reduced-motion card hover.
- **Agent templates search**: free-text find in Templates modal (works with category tabs); reduced-motion open.
- **Expertise selector a11y**: radiogroup levels, labelled domain field; wired into Profile settings with normalized save.
- **Profile save honesty**: name validation, role=alert on failure, Saved status feedback (no silent catch).
- **Persona swap search**: find minds in the slot-swap dialog; dialog a11y + reduced-motion open.
- **Personas panel save**: busy Save, real error copy, status/alert toast roles.
- **Room board search**: filter tasks by title/answer/member; search Agent history in the add-task picker; Escape + body scroll lock.
- **Room synthesis copy**: export group synthesis (contradictions, patterns, tasks) as markdown with success/failure feedback.
- **Watchlist copy**: export current filtered watchlist as markdown (status, cadence, latest run) with clipboard feedback.
- **Contextual tab titles**: Rooms show the room name; public `/share` shows the mind (or prompt snippet).
- **Room keyboard**: `/` focuses board or picker search; `?` opens Room shortcuts; Esc still closes add-task.
- **Watchlist keyboard**: `/` focuses search; `?` opens Watchlist shortcuts; Esc cancels pending remove.
- **Room invite share**: system share sheet when available (public `/room` URL); clipboard fallback + Copy link.
- **Personas keyboard**: `/` focuses library or swap search; `?` opens Personas shortcuts; Esc closes swap.
- **Personas reset confirm**: two-step “Reset panel?” before wiping custom slots; Esc cancels; toast on success.
- **Agent history copy**: export the current filtered research history as markdown (scores, topics, task ids).
- **Agent Rooms list honesty**: load failure ≠ empty (Retry); search when you have 3+ rooms; real empty copy.
- **Create room modal**: works from idle Agent sidebar; name validation, busy state, Esc close, real errors.
- **Agent history load honesty**: failed history fetch ≠ empty (Retry); watchlist cadence radios + Esc cancel.
- **Personas panel copy**: export the current four minds as markdown (slots, quotes, descriptions).
- **Upgrade checkout honesty**: Razorpay failures surface as role=alert (no silent dismiss); offline banner is assertive alert.
- **Agent history rename**: title validation (required/max), optimistic update with rollback, role=alert on failure.
- **Arena sidebar renames**: custom turn titles persist in localStorage; validation + Esc-safe save.
- **Create-room share**: system share sheet after room create (with copy fallback); Agent toasts use status/alert by severity.
- **Templates load honesty**: failed catalog fetch ≠ empty (Retry); history delete restores row on API failure.
- **Agent refine follow-up**: 1000-char budget (API-aligned), restore draft on failure, role=alert on errors.
- **Agent multi-task + challenge**: 2000-char caps per parallel question; challenge failures alert + Retry.
- **Arena recent chips**: visible remove (×) + Delete key; stress-from-Agent banner dismissible status.
- **Arena prompt draft autosave**: long prompts survive refresh / route changes; cleared once the pipeline accepts (preserved if it rejects).
- **Agent compose drafts**: idle task + per-task follow-up autosave to localStorage; cleared only after successful start/refine.
- **Arena Stop**: header control aborts in-flight panel/stream or focused chat; phase returns to idle cleanly.
- **Agent Stop**: header control cancels pipeline poll / refine / challenge loops without a stuck busy state.
- **Cross-pollinate busy**: loading label while opening Arena; Discuss/Debate errors are dismissible.
- **Agent error recovery**: dismissible alert card + Edit compose; upload errors dismissible; Pricing success/error live regions.
- **Back to top**: floating control after deep scroll; reduced-motion safe; focuses #main-content.
- **Agent recent chips**: visible hide (×) + Delete key; list semantics (Arena recent-chip parity).
- **Cross-pollinate banner**: dedicated status chip with optional IQ score; clears when Arena finishes.
- **Perspective comparison**: persona names/colors, Escape + dialog a11y, copy markdown, honest confidence/score labels.
- **Perspective drift copy**: Room drift panel exports score, clusters, and divergences as markdown (room name in title) with clipboard feedback.
- **Room board copy**: export the research board (or current search filter) as markdown — titles, authors, scores, excerpts.
- **Saved takes bulk copy**: sidebar “Copy all” exports filtered bookmarks as markdown (mind, question, take, score).
- **Arena recents copy**: sidebar Recents “Copy” exports filtered turns (title, prompt, winner, category) as markdown.
- **Download .md**: Arena four-mind comparison and Agent answers can download markdown files (not only clipboard).
- **Answer evolution export**: Agent temporal evolution panel supports copy + download markdown (score, shifts, related runs).
- **Answer evolution timeline**: related research runs listed with snippets/scores; open prior runs from the panel.

## Required production environment

| Variable | Notes |
|---|---|
| `ENVIRONMENT` | Must be `production` |
| `SECRET_KEY` | ≥32 chars, not a known default |
| `ANTHROPIC_API_KEY` | `sk-ant-…` |
| `DATABASE_URL` | `postgresql://…` only (no SQLite) |
| `ENCRYPTION_KEY` | 44-char Fernet key |
| `ALLOWED_ORIGINS` | Public HTTPS origin(s); no `*`; not localhost-only |
| `FRONTEND_PUBLIC_URL` | Public HTTPS frontend URL (not localhost) |
| `OPENAI_API_KEY` / `GROK_API_KEY` / `DEEPSEEK_API_KEY` | Optional; personas fall back to Claude |
| Razorpay keys | Optional until billing is enabled |

## Condura honesty flag

```bash
# Staged default is OFF (fallback: local-intent may still run as web research).
# Flip when ready for honest 409 + CTA path:
CONDURA_HONEST_REJECTION_ENABLED=true
```

Kill switch: set to `false` / unset.

Before broad flip, optionally run the migration scan (see `web/backend/docs/HANDOFF.md`).

## Verify commands (pre-ship)

### Backend

```bash
cd web/backend
source .venv/bin/activate   # or: .venv/bin/python
python -m pytest tests/test_capabilities.py tests/test_agent_capability_gate.py \
  tests/test_production_config.py tests/test_condura_migration.py \
  tests/test_condura_reconciler.py tests/test_condura_routes_integration.py -q
```

### Frontend

```bash
cd web/frontend
npm test
npm run build
```

### Health

```bash
curl -sS https://<api-host>/api/health
# Expect: "status":"healthy" and "database":"connected" when DB is up
# Expect: "status":"degraded" when DB is down
```

## Product honesty (do not regress)

- Arena is **web-only** — no browser computer control, no cloud desktop default.
- Local / on-device work → Condura (install CTA, handoff). Never claim success if Condura is unavailable.
- Web Agent research pipeline remains valid for pure research (`agent.research`).

## Docs

- ADR: `web/backend/docs/adr/0001-condura-integration.md`
- Integration offer: `web/backend/docs/condura/INTEGRATION.md`
- State ledger: `web/backend/docs/HANDOFF.md`
