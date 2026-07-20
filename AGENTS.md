# Arena — Agent Working Reference

> **What this is:** the canonical onboarding doc for any agent (Claude, opencode, etc.) working in this repo. It captures the *concept*, architecture, conventions, and the non-obvious rules that exist for safety or product-honesty reasons. Read this before editing.
>
> The public-facing `README.md` is user-facing marketing/docs. This file is the engineering truth.

---

## 1. The concept in one paragraph

**Arena is a multi-AI agent chatroom.** A user submits a prompt; **four AI personas answer in parallel** (token-streamed over SSE), a **fifth LLM (the Scorer) ranks them** on relevance/insight/clarity/intellectual-honesty, and the winner is surfaced. Users can then **Debate** (challenge an agent's answer), **Discuss** (1-on-1 focused follow-up thread with one persona), or **Verify** (send the winner into Agent Mode for deeper research). A separate **Agent Mode** runs an **8-stage research pipeline** (planner → researcher → steelman → solver → critic → verifier → synthesizer → judge, with a refinement loop) on long-form questions. Everything is tier-gated (Guest / Free / Plus / Pro) with Razorpay subscriptions and an optional Plus→Agent add-on.

**Marketing copy says "7 stages" for Agent Mode** — that is intentional (matches the runtime status stages the UI shows). The pipeline has 8 stages because steelman is injected between researcher and solver. Do not "fix" this discrepancy in copy without checking with the owner.

---

## 2. High-level architecture

```
Multi-Agents/
├── backend/        Python 3.11 · FastAPI · SQLAlchemy 2 · Alembic · PG (SQLite dev fallback)
├── web/frontend/   React 18 · TS · Vite · Tailwind · react-router v7
├── app/            (built/runnable application output — currently just README)
├── arena-video/    Remotion project (marketing video). Gitignored. Out of scope for app changes.
├── design/         HTML/JS prototypes + screenshots. Gitignored. Never ship from here.
└── render.yaml     Deploy: backend = web service, frontend = static site
```

**Two production surfaces:**
- `backend/` → Render web service (`python migrate_and_start.py`)
- `web/frontend/` → Render static site (`npm run build` → `dist/`), also deployable to Vercel

**The frontend talks to the backend via `/api/*`** (Vite dev proxy + CORS allowlist in prod). Never hardcode a backend URL in frontend code — use `apiFetch` and `VITE_API_URL`.

---

## 3. Backend deep-dive (`backend/`)

### 3.1 Entry point & app factory
- `main.py` — `create_app()` factory. Wires middleware (order matters — outermost first), routers, exception handlers, startup tasks, health endpoints. `app = create_app()` is the ASGI app uvicorn loads.
- `migrate_and_start.py` — prod entrypoint. Runs additive Alembic migrations then execs uvicorn. **Degraded DB mode is intentional** so the process still binds `$PORT` and Render's health probe passes.
- `start.sh` — dev convenience: `uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}`.

### 3.2 The Arena core flow (`backend/arena/core/`)
The heart of the product. Read these before touching prompt/debate/discuss routes:

| File | Role |
|---|---|
| `agents.py` | The **16 persona system prompts** + `PERSONA_METADATA` (name/color/temp) + `call_persona()` (routes to provider with Claude fallback). Each persona prompt ends with a `RESPONSE_FORMAT_SUFFIX` forcing JSON `{verdict, one_liner, confidence, key_assumption}`. |
| `orchestrator.py` | `Orchestrator` — parallel fan-out of 4 agents via `asyncio.gather`. Two modes: `run_all_agents` (batch) and `stream_all_agents` (SSE queue). Always emits `{"type": "all_done"}` sentinel, even on failure (else SSE consumer hangs). |
| `scorer.py` | `Scorer` — the 5th LLM call. Deterministic (temp 0.0). Scores 0-100 per agent on 4 criteria. Logs `ScoringAudit` row. Falls back to score=50 for all on failure. |
| `model_router.py` | Central routing table. `MODEL_REGISTRY` (claude_haiku/sonnet/opus, gpt_4o/mini, grok_3/mini, deepseek_v4_flash), `TASK_ROUTES` (per-task primary+fallback), `PERSONA_ROUTES` (persona→model). `claude_opus` is disabled (Pro-tier reserved). Missing optional keys → Claude fallback. |
| `tier_config.py` | The tier matrix. `UserTier` enum, `TIER_PERSONAS` (6 free / 16 paid), `TIER_MESSAGE_LIMITS`, `TIER_DAILY_LIMITS` (token budgets), `TIER_FEATURES`. `has_feature("agent_mode", user=user)` respects the Plus+Agent add-on. |
| `agent_pipeline.py` | The 8-stage Agent Mode. Runs on a `Blackboard` (in-memory state object in `blackboard.py`). Refinement loop: solver→synthesizer→judge until not `NEEDS_REVISION` (max 2 iters). Post-pipeline: intelligence_score, assumptions, dissent_report, temporal_profile (all parallel, all best-effort). |
| `blackboard.py` | `Blackboard` dataclass + `active_tasks` dict (in-memory, keyed by `task_id`). This is **process-local state** — multi-worker deploys would lose tasks on restart. Currently single-worker on Render. |
| `stages/` | One file per pipeline stage: `planner.py`, `researcher.py`, `solver.py`, `critic.py`, `verifier.py`, `synthesizer.py`, `judge.py`. Each takes a `Blackboard`, returns it mutated. |
| `input_pipeline.py` | Pre-flight: sanitize, classify, toxicity check (rules + LLM), prompt-injection detection (17 phrases). Runs before any agent. |
| `memory.py` | Short-term session + long-term memory. `MemoryRelevanceRanker` ranks past memories per prompt and injects top 3 into persona system prompts. |
| `cost_tracker.py` | Per-request token accounting + daily token budget enforcement. `RateLimitExceeded` / `TokenBudgetExceeded` exceptions. |
| `rate_limits.py` / `rate_limiter_pro.py` | In-memory IP/user throttling. Pro tier uses a rolling 45-msg/5h window. |
| `persona_integrity.py` | Drift detection — does the response match the persona's "fingerprint"? Flagged to scorer for penalty. |
| `contradiction_detector.py` / `pipeline_contradiction_detector.py` | Cross-response and cross-task contradiction detection. |
| `mcp_runtime.py` | Model Context Protocol integration (Notion, GitHub, etc.) for Agent Mode context. Tokens encrypted at rest with Fernet (`ENCRYPTION_KEY`). |
| `observability.py` | Daily-rotating JSON logs, `LatencyTracker`, health data, scoring audit logging. |
| `llm_caller.py` / `llm_retry.py` | Provider-aware call/stream + tenacity retry for transient LLM errors. |

### 3.3 Routes (`backend/arena/routes/`)
One router per feature area. **All mounted in `main.py:create_app()`** — if you add a router, mount it there. Prefix conventions:
- `/api/auth/*`, `/api/prompt*`, `/api/debate/*`, `/api/discuss/*`, `/api/session/*` — core Arena
- `/api/memory/*`, `/api/personas`, `/api/panel*`, `/api/saved*`, `/api/analytics/*` — Plus-tier features
- `/api/payments/*` — Razorpay (webhook signature verified via HMAC-SHA256)
- `/api/agent/*` — Agent Mode (Pro tier, or Plus+add-on)
- `/api/calibration/*`, `/api/rooms/*`, `/api/mcp/*`, `/api/condura/*` — extended features
- `/api/metrics`, `/api/health`, `/api/health/detailed` — ops

### 3.4 Database (`backend/arena/db_models.py`)
~15 SQLAlchemy 2 tables. Key ones: `User`, `DBSession`, `UsageRecord`, `UserPanel`, `SavedResponse`, `AgentTask`, `DiscussThread`, `ScoringAudit`, `PersonaDriftLog`, `ConfidenceRating`, `AnswerFeedback`, `Subscription`, `AgentStance`, `SessionSummary`, `UserPreference`, `RevokedToken` (JWT blacklist, alembic-migrated).

**Migrations:** Alembic in `backend/alembic/`. `create_all()` runs as dev fallback but the startup warns if `alembic_version` is missing. Always create a migration for schema changes — don't rely on `create_all()`.

### 3.5 Settings (`backend/arena/config.py`)
`Settings` (pydantic-settings). `get_settings()` is `@lru_cache`'d. **`validate_secrets()` runs at startup and `sys.exit(1)`s on critical failures** (weak SECRET_KEY, missing ANTHROPIC_API_KEY, prod without DATABASE_URL/ENCRYPTION_KEY/HTTPS frontend, etc.). In production it fail-closes; in dev it warns and uses SQLite fallback. Don't weaken these checks.

---

## 4. Frontend deep-dive (`web/frontend/`)

### 4.1 Structure
- `src/main.tsx` — routes + provider stack (`AuthProvider > TierProvider > PanelProvider > ProfileModalProvider`). Pages lazy-loaded via `React.lazy` for chunk splitting. `ErrorBoundary` wraps everything.
- `src/App.tsx` — **the Arena view** (~1400 lines). 2×2 grid of `AgentCard`s, SSE streaming, Debate/Discuss/Leaderboard view modes, focused-agent panel, session management. This is the most complex component.
- `src/api.ts` — all backend calls, typed. Use `apiFetch` (handles auth + base URL).
- `src/types.ts` — shared TS types (mirror backend Pydantic schemas in `arena/models/schemas.py`).
- `src/pages/` — one file per route. Most have a co-located `.test.tsx`.
- `src/components/` — ~70 components. `AgentCard`, `PromptInput`, `DebateMode`, `DiscussMode`, `Sidebar`, `AuthModal`, `UpgradeModal`, `ProfileModal`, `RazorpayCheckout`, `ConduraBadge`, `ConduraInstallCTA`, etc.
- `src/context/` — `AuthContext`, `TierContext`, `PanelContext`, `ProfileModalContext`.
- `src/hooks/` — `useAuth`, `useTier`, `useIsMobile`, `useBusyNavigationGuard`, `useBusyDocumentTitle`.
- `src/lib/` — pure helpers (`apiFetch`, `tokenStorage`, `clipboard`, `downloadTextFile`, `arenaExport`, `chatScroll`, `motion`, `recentPrompts`, `slashFocus`, `busyNavigationGuard`).

### 4.2 Key routes (`src/main.tsx`)
| Path | Component | Gate |
|---|---|---|
| `/` | HomePage | public |
| `/app` | App (Arena) | auth required |
| `/agent` | AgentPage | auth required |
| `/agent/watchlist` | WatchlistPage | auth required |
| `/account` | AccountPage | auth required |
| `/personas`, `/pricing`, `/product`, `/capabilities`, `/docs`, `/about`, `/changelog`, `/terms`, `/privacy` | public pages | — |
| `/share`, `/room/:slug` | public share/room | — |
| `/arena` | redirect → `/app` | auth required |

### 4.3 Frontend conventions
- **Tests:** Vitest for unit/component (`*.test.tsx` co-located), Playwright for E2E (`e2e/` dir). Every page has a test file. Run `npm test` (vitest) and `npm run test:e2e` (playwright).
- **Lints:** `npm run lint` (eslint flat config). `npx tsc --noEmit` for typecheck. `npm run build` = `tsc -b && vite build`.
- **Motion:** shared `lib/motion.ts` + `prefers-reduced-motion` helpers. All animations must honor reduced motion — see `SHIP-CHECKLIST.md` for the huge list of motion-honor gates.
- **Clipboard:** always use `lib/clipboard` `copyToClipboard` (has fallback), never `navigator.clipboard` directly.
- **Auth:** JWT in localStorage via `lib/tokenStorage`. `ProtectedRoute` guards auth-required routes with redirect intent.
- **SSE:** `streamPrompt` / `streamDiscuss` use `fetch` + `ReadableStream` reader (not EventSource) to allow `AbortController` cancellation. Always wire abort on unmount / new chat / navigation.

---

## 5. The Condura integration (read before touching local-execution code)

**Arena is web-only. It does not control the user's browser/desktop.** Local/on-device work (open Linear, save a file to ~/Documents, run a shell command) is delegated to **Condura** — a separate daemon the user installs.

- **Capability gate:** `arena/core/capabilities.py` classifies tasks as `web` / `condura` / `hybrid`. When `CONDURA_HONEST_REJECTION_ENABLED=true`, local-intent tasks get HTTP 409 `requires_local_execution` on `/api/agent/run`. **Default is OFF** (staged rollout). Watchlist + live re-runs also skip local-intent tasks when the flag is on.
- **Frontend:** `ConduraBadge` + `ConduraInstallCTA` + a probe to `127.0.0.1` (browser-enforced local-only). Handoff crypto is JCS + ECDSA.
- **Docs:** `backend/docs/adr/0001-condura-integration.md`, `backend/docs/condura/INTEGRATION.md`, `backend/docs/condura/CAPABILITY-REGISTRY.md`, `backend/docs/HANDOFF.md` (state ledger — newest entries at top, append after every session that changes Condura status), `backend/docs/TELEMETRY.md`.
- **Never claim success for local work without Condura.** This is a product-honesty invariant. See `web/SHIP-CHECKLIST.md` "Product honesty (do not regress)".

---

## 6. Tiers & feature gates

| Tier | Daily msgs | Daily tokens | Personas | Agent Mode | Other |
|---|---|---|---|---|---|
| Guest | 3 | 25k | 6 free | no | — |
| Free | 5 | 25k | 6 free | no | — |
| Plus | 15 | 100k | all 16 | no (add-on available) | Debate, Discuss, Memory, Saved, History, Rooms, Watchlist |
| Pro | 35 + rolling 45/5h | 300k | all 16 | yes | + Orchestration, Scoring audit, Calibration, Unlimited debates |
| Plus + Agent add-on | — | — | all 16 | yes (₹599/mo) | — |

**Always check access via `has_feature(tier, feature, user=user)`** in `tier_config.py`. Persona access via `validate_persona_access(tier, persona_ids)`. The Plus+Agent add-on is active when `user.agent_addon_active` or `user.agent_addon_cancelling` (still paid through period end).

---

## 7. Security invariants (do not regress)

- **Request size limit:** 10 KB default, 10 MB for file uploads (`RequestSizeLimitMiddleware`).
- **CORS:** `ALLOWED_ORIGINS` env (no `*` in prod, no trailing slashes). Dev auto-adds `localhost:5173`.
- **Security headers:** every response gets CSP, X-Frame-Options DENY, COOP/COEP, HSTS in prod. Server fingerprinting headers stripped.
- **Rate limits:** global 100/min/IP (excludes payment webhook), per-user tier-based, per-endpoint (login, registration, payments have their own).
- **Auth:** bcrypt 12-round + SHA-256 prehash (legacy verify path kept for backwards compat). JWT via PyJWT 2.13.0 (migrated off python-jose to drop ecdsa timing-attack dep). Revoked tokens persisted in `revoked_tokens` table (jti-hashed) + in-process cache + hourly purge.
- **Payments:** Razorpay webhook HMAC-SHA256 verified. Razorpay MCP tokens Fernet-encrypted at rest (`ENCRYPTION_KEY`).
- **Prompt injection:** 17 known phrases blocked + two-tier toxicity (rules + LLM).
- **Secrets:** `SECRET_KEY` ≥32 chars and not a known default. `ANTHROPIC_API_KEY` required, `sk-ant-` prefixed. `ENCRYPTION_KEY` must be 44-char Fernet. Production fail-closes on any missing critical env var.

---

## 8. Development commands

### Backend (run from `backend/`)
```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env       # set ANTHROPIC_API_KEY + SECRET_KEY at minimum
alembic upgrade head       # first time only
python main.py             # or: bash start.sh
```
- API: `http://localhost:8000` · Health: `/api/health`
- Tests: `pytest -q` (197 test files, conftest in `tests/conftest.py`)
- Compile check: `python -m compileall -q arena`
- Security scan: `pip-audit -r requirements.txt` (HIGH/CRITICAL fails CI)

### Frontend (run from `web/frontend/`)
```bash
npm install
npm run dev                # Vite dev server, proxies /api → backend
npm test                   # Vitest
npm run test:e2e           # Playwright (requires backend running)
npm run lint                # ESLint
npx tsc --noEmit           # Typecheck
npm run build              # tsc -b && vite build → dist/
```
- UI: `http://localhost:5173`

### CI (`.github/workflows/ci.yml`)
Three jobs: `backend` (pytest + compileall + pip-audit + gitleaks + pin-floor guard), `frontend` (npm audit + tsc + vitest + build + pin-floor guard), `e2e` (Playwright smoke, needs backend+frontend). All must pass on PRs to `main`.

**Pin-floor guards** (in `ci.yml`) lock security-required versions. A regression below the floor fails the build. `python-jose` and `ecdsa` are **forbidden** (use PyJWT). Don't reintroduce them.

---

## 9. Non-obvious rules that will bite you

1. **The `all_done` sentinel in `stream_all_agents` MUST always be emitted**, even on failure. The SSE consumer blocks on `queue.get()` forever without it. Use `put_nowait` in a `finally` block.
2. **Stance archiving is best-effort and must never raise into the caller.** On the streaming path, a raise skips `all_done` and hangs the SSE consumer.
3. **Agent pipeline post-processing (intelligence_score, assumptions, dissent, temporal) is all parallel + all best-effort.** Any failure → empty dict / None. The pipeline still completes.
4. **`create_all()` succeeding does NOT mean schema is current.** Always create Alembic migrations for schema changes. Startup warns (prod: errors) if `alembic_version` is missing.
5. **`has_feature("agent_mode", ...)` needs the `user=` kwarg for Plus-tier add-on logic.** Calling without `user=` returns False for Plus even if the add-on is active.
6. **Marketing says "7 stages" for Agent Mode.** Runtime has 8 (steelman is injected). Don't "fix" the copy without checking with the owner — it's intentional to match what the UI status shows.
7. **Persona prompts end with `RESPONSE_FORMAT_SUFFIX` forcing JSON.** Don't remove it — the orchestrator parses JSON responses.
8. **Missing optional LLM keys (OpenAI/Grok/DeepSeek) fall back to Claude Sonnet silently.** This is by design. Don't add hard failures.
9. **`active_tasks` (blackboard store) is process-local.** Render runs single-worker; multi-worker would lose tasks on restart. Don't introduce a second worker without externalizing this state.
10. **Frontend SSE uses `fetch` + `ReadableStream`, not `EventSource`.** This allows `AbortController` cancellation. Always wire abort on unmount/new-chat/navigation — see `useBusyNavigationGuard`.
11. **`/arena` redirects to `/app`.** Don't add content at `/arena`.
12. **The `design/` and `arena-video/` dirs are gitignored.** Never commit changes there as part of an app change.
13. **Honesty invariants in `web/SHIP-CHECKLIST.md` "Product honesty (do not regress)".** Read that section before touching any capability/local-execution copy or UI.
14. **Tests are extensive and load-bearing.** 197 backend test files + a frontend test per page + Playwright E2E. Don't skip writing tests for new behavior; CI will catch regressions.
15. **`validate_secrets()` runs before `setup_logging()`** — it uses Python's LastResort handler to emit to stderr. Don't move logging setup before it.

---

## 10. Where to look first when stuck

| Question | Look at |
|---|---|
| "How does a prompt get answered?" | `routes/prompt.py` → `orchestrator.py` → `agents.py` → `scorer.py` → `response_shaper.py` |
| "How does Agent Mode work?" | `routes/agent.py` → `agent_pipeline.py` → `blackboard.py` → `stages/*.py` |
| "Which model does persona X use?" | `model_router.py` `PERSONA_ROUTES` + `MODEL_REGISTRY` |
| "What can tier X do?" | `tier_config.py` `TIER_FEATURES` / `has_feature()` |
| "How is a response shaped for the API?" | `core/response_shaper.py` `assemble_payload()` |
| "What's the DB schema?" | `arena/db_models.py` + `alembic/versions/` |
| "How does the frontend stream?" | `src/api.ts` `streamPrompt` / `streamDiscuss` + `src/App.tsx` `handleSubmit` |
| "What env vars do I need?" | `backend/.env.example` + `render.yaml` + `web/SHIP-CHECKLIST.md` "Required production environment" |
| "Is Condura ready for prod?" | `backend/docs/HANDOFF.md` (newest entry at top) |
| "What shipped recently / what's the bar?" | `web/SHIP-CHECKLIST.md` |
| "Why does this weird code exist?" | The long inline comments in `main.py`, `config.py`, `ci.yml`, and `orchestrator.py` explain historical decisions. Read them before "cleaning up." |

## 11. Current workspace diagnostic notes (verified 2026-07-20)

The working tree may contain simultaneous feature work. At this snapshot, backend model routing is migrating DeepSeek consumers from the removed `deepseek_v3` / `deepseek-chat` entry to `deepseek_v4_flash` / `deepseek-v4-flash`; `llm_caller.py` explicitly disables DeepSeek thinking for both normal and streaming OpenAI-compatible calls. Search current consumers, test stubs, and current docs after routing changes. A historical changelog entry may intentionally preserve the model name that shipped at that time; distinguish historical copy from a live route contract.

The public pages are also undergoing a Verdict Prism redesign. Pricing's current DOM uses `pricing-tier-card*`, `pricing-depth-instrument*`, `pricing-matrix*`, and `pricing-faq-studio*`; it no longer uses the older `pricing-plan-card*` / `pricing-feature-list*` contracts. Update tests to the current component contract instead of adding legacy classes back just to satisfy stale tests.

For local verification on this macOS workspace, use `backend/.venv/bin/python -m pytest` rather than assuming a `python` executable exists on PATH. Frontend checks run from `web/frontend`: `npm run lint`, `npx tsc --noEmit`, `npm test`, and `npm run build`. jsdom may print canvas/localStorage warnings from `MicroLoader`; treat assertion summaries and exit codes as authoritative. Never report the repository as green until the full relevant suite and build have completed after the latest edit.

Verified after the latest workspace edits: backend compile plus pytest passed with 1382 tests; frontend Vitest passed 836 tests across 148 files; TypeScript, production build, and ESLint passed (0 errors, 121 warnings). The backend initially found two new silent exception swallows after the DeepSeek migration; both now log the fallback/traceback and the focused regression suite passes.

Remember that Arena's `RequestCostAccumulator` is not populated from provider token usage on the main Arena prompt path, while Agent Mode records blackboard totals separately. Do not use Arena usage rows as authoritative token accounting until that seam is intentionally fixed and tested.

Before editing, inspect `git status` and the diff: the user may have uncommitted backend provider work and large public-page changes in the same workspace.
