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
- **Debate end honesty**: after max rounds, only Back to Arena — no fake “Ask a follow-up”.
- **Upgrade modal a11y**: Escape closes (gated during Razorpay), dialog semantics, body scroll lock.

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
