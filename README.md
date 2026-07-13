# Arena

**Multi-AI Agent Chatroom** — Four minds respond to your prompt in parallel, a fifth scores them, the best answer wins.

---

## What it does

Send a prompt. Four AI agents — each with a distinct reasoning style — answer simultaneously, streamed token-by-token. A scorer LLM evaluates every response on relevance, insight, clarity, and intellectual honesty, then surfaces the winner. Drill into any agent's full answer, challenge its reasoning in **Debate Mode**, or have a private follow-up thread in **Focus Mode**.

A separate **Agent Mode** runs an 8-stage research pipeline (planner → researcher → steelman → solver → critic → verifier → synthesizer → judge) on long-form questions, with refinement loops and intelligence scoring.

## The personas

Sixteen reasoning styles, each routed to a different LLM provider based on fit:

| Persona | Style | Provider | Temp |
|---|---|---|---|
| The Analyst | Cold, finds the flaw in everything | DeepSeek V3 | 0.2 |
| The Philosopher | First-principles, reframes the premise | GPT-4o | 0.7 |
| The Pragmatist | Street-smart, only what works | GPT-4o mini | 0.5 |
| The Contrarian | Says what others won't | Grok-3 mini | 1.0 |
| The Scientist | Evidence-only, distinguishes data from inference | DeepSeek V3 | 0.2 |
| The Historian | Names a specific precedent before any broader point | GPT-4o | 0.3 |
| The Economist | Traces incentives before reaching a conclusion | DeepSeek V3 | 0.4 |
| The Ethicist | Applies multiple frameworks, names who bears the cost | Claude Sonnet | 0.5 |
| The Stoic | Distinguishes what's within your control from what isn't | DeepSeek V3 | 0.3 |
| The Futurist | Extrapolates trajectories, names second-order effects | Grok-3 mini | 0.9 |
| The Strategist | Asymmetric moves, leverage, positioning | Grok-3 | 0.5 |
| The Engineer | Constraints, failure modes, bottlenecks | DeepSeek V3 | 0.2 |
| The Optimist | Evidence-based, names the mechanism of good outcomes | GPT-4o mini | 0.7 |
| The Empath | Names the people most affected by the dominant framing | Claude Sonnet | 0.6 |
| First Principles | Tears assumptions down to bedrock | DeepSeek V3 | 0.7 |
| Devil's Advocate | Steelmans the contrary position | Grok-3 mini | 1.0 |

Each prompt picks 4 of these 16 for the panel. The panel is fully editable.

## Tech stack

- **Backend**: Python 3.11+ · FastAPI · SQLAlchemy 2 · Alembic · PostgreSQL (SQLite fallback for dev)
- **Frontend**: React 18 · TypeScript · Tailwind CSS · Vite · react-router v7
- **LLM providers**: Anthropic (default), OpenAI, xAI (Grok), DeepSeek — all with automatic Claude fallback when a key is missing
- **Payments**: Razorpay subscriptions (Plus / Pro / Agent Mode add-on)
- **External tools**: Model Context Protocol (MCP) — connect Notion, GitHub, etc. as context sources for Agent Mode
- **Observability**: Daily-rotating JSON logs, per-request latency tracking, scoring audits, persona drift detection

## Tiers

| Tier | Daily messages | Daily tokens | Personas | Notable features |
|---|---|---|---|---|
| **Guest** | 3 | 25k | 6 free | — |
| **Free** (registered) | 5 | 25k | 6 free | — |
| **Plus** | 15 | 100k | all 16 | Debate, Focus chat, Memory, Saved responses, Watchlist |
| **Pro** | 35 + rolling 45/5h | 300k | all 16 | + Agent Mode, Orchestration, Scoring audit |
| **Plus + Agent add-on** | — | — | all 16 | Unlocks Agent Mode for Plus users (₹599/mo) |

## Quick start

### Prerequisites
- Python 3.11+
- Node.js 18+
- Anthropic API key (required). OpenAI / Grok / DeepSeek keys optional — those personas fall back to Claude.
- PostgreSQL (optional for dev — SQLite works out of the box)

### Backend

```bash
cd web/backend

python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate

pip install -r requirements.txt

cp .env.example .env
# Edit .env — at minimum set ANTHROPIC_API_KEY and SECRET_KEY.

# Run migrations (first time only)
alembic upgrade head

# Start the server
python main.py
# or:  bash start.sh
```

API lives at `http://localhost:8000`. Health check at `/api/health`.

### Frontend

```bash
cd web/frontend

npm install
npm run dev
```

UI at `http://localhost:5173`. The Vite dev server proxies `/api` calls to the backend.

## API surface (selected)

```
POST /api/auth/register|login|refresh|logout|me
POST /api/prompt            Submit prompt, get 4 responses + winner
POST /api/prompt/stream     Same, with SSE token streaming
POST /api/debate/stream     Challenge an agent's answer
POST /api/discuss/stream    1-on-1 follow-up with one persona
GET  /api/session/:id       Session history
POST /api/memory/save       Compress session to long-term memory
GET  /api/personas          Full persona catalog
GET  /api/panel             / POST /api/panel/save — your 4-slot panel

POST /api/agent/run|orchestrate|refine|challenge|rebuttal|feedback
GET  /api/agent/status/:id|result/:id|history|templates
POST /api/agent/watchlist   Recurring research questions
POST /api/agent/upload      File attachment (max 10 MB)
POST /api/agent/memory/context

POST /api/payments/subscribe|verify|cancel|webhook
POST /api/payments/addon/agent/subscribe|cancel|reactivate

POST /api/calibration/rate  Rate your own confidence
GET  /api/calibration/stats | /api/calibration/rating/:task

GET  /api/user/usage|tier|answer-feedback-stats
PATCH /api/user/profile
```

## Project layout

```
Multi-Agents/
├── web/                            ← all web application source
│   ├── backend/
│   │   ├── arena/
│   │   │   ├── core/
│   │   │   │   ├── agents.py            16 persona prompts + routing
│   │   │   │   ├── orchestrator.py      Parallel fan-out + streaming
│   │   │   │   ├── scorer.py            5th LLM scoring + winner pick
│   │   │   │   ├── agent_pipeline.py    7-stage Agent Mode pipeline
│   │   │   │   ├── stages/              planner / researcher / solver / critic / verifier / synthesizer / judge
│   │   │   │   ├── input_pipeline.py    Sanitize, classify, toxicity check
│   │   │   │   ├── model_router.py      Per-persona, per-task model routes
│   │   │   │   ├── tier_config.py       Tier matrix, feature flags, limits
│   │   │   │   ├── rate_limits.py       In-memory IP/user throttling
│   │   │   │   ├── rate_limiter_pro.py  Pro rolling window
│   │   │   │   ├── cost_tracker.py      Per-request token accounting
│   │   │   │   ├── memory.py            Short-term + long-term memory
│   │   │   │   ├── persona_integrity.py Drift detection
│   │   │   │   ├── contradiction_detector.py
│   │   │   │   ├── observability.py     JSON logging + health
│   │   │   │   ├── mcp_runtime.py       MCP tool integration
│   │   │   │   └── tools/               calculator / datetime / web_search
│   │   │   ├── routes/                  FastAPI routers — one per feature area
│   │   │   ├── db_models.py             15 SQLAlchemy tables
│   │   │   ├── models/schemas.py        Pydantic request/response models
│   │   │   ├── database.py              PG-primary, SQLite-fallback engine
│   │   │   └── config.py                Settings + secret validation
│   │   ├── alembic/                     Migrations (3 revs so far)
│   │   ├── main.py                      App factory, middleware, lifespan
│   │   ├── requirements.txt
│   │   └── .env.example
│   ├── frontend/
│   │   ├── src/
│   │   │   ├── api.ts                   All backend calls, typed
│   │   │   ├── App.tsx                  Arena view (2×2 grid + streaming)
│   │   │   ├── main.tsx                 Routes + provider stack
│   │   │   ├── pages/                   Home / Arena / Agent / Rooms / Pricing / ...
│   │   │   ├── components/              AgentCard, PromptInput, DebateMode, ...
│   │   │   ├── context/                 Auth / Tier / Panel / ProfileModal
│   │   │   ├── hooks/                   useAuth, useIsMobile, useCalligraphyCanvas
│   │   │   ├── lib/                     apiFetch, tokenStorage
│   │   │   └── types.ts                 Shared TypeScript types
│   │   ├── vercel.json                  Production CSP + headers
│   │   ├── tailwind.config.js
│   │   └── vite.config.ts
│   └── README.md                       Web app run instructions
├── app/                            ← built / runnable application output
└── README.md
```

## Security

- All requests run through `RequestSizeLimitMiddleware` (10 KB default, 10 MB for file uploads)
- CORS locked to allowlist via `ALLOWED_ORIGINS` env
- Security headers on every response (HSTS in prod, X-Frame-Options DENY, etc.)
- Per-IP global rate limit (100/min) + per-user tier-based limits + per-endpoint limiters (login, registration, payments)
- Razorpay webhook signature verification via HMAC-SHA256
- Razorpay MCP tokens encrypted at rest with Fernet
- Passwords: bcrypt 12-round with SHA-256 prehash; legacy verify path retained for backwards compatibility
- Prompt-injection detection (17 known phrases) + two-tier toxicity gate (rules + LLM)

## License

Private project.