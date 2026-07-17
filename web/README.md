# Web

This directory holds **all web application source** for the Arena project. It is the single
home for everything that runs in the browser and on the web server.

```
web/
├── backend/    FastAPI + SQLAlchemy service (the API)
└── frontend/   React + TypeScript + Vite client (the UI)
```

The `app/` directory at the repository root is reserved for the **built / runnable
application** (deployment artifacts, packaged builds, containers). Keep source here in
`web/`; ship output to `app/`.

## Running locally

Both services run independently during development. The Vite dev server (frontend)
proxies `/api` calls to the backend.

### Backend (API)

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # set ANTHROPIC_API_KEY and SECRET_KEY at minimum
alembic upgrade head          # first run only
python main.py                # or: bash start.sh
```

- API:        `http://localhost:8000`
- Health:     `http://localhost:8000/api/health`

### Frontend (UI)

```bash
cd web/frontend
npm install
npm run dev
```

- UI:         `http://localhost:5173`

## Adding new web pieces

New web-facing services or packages (e.g. a worker, a gateway, a docs site) live as
sibling directories under `web/` — not at the repository root — so the root stays
clean and everything web-scoped is discoverable in one place.
ce.
