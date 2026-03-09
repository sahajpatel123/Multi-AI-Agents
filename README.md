# Arena

Multi-AI Agent Chatroom — Four minds, one question, the best answer wins.

## Overview

A web platform where 4 AI agents — each with a distinct personality and reasoning style — simultaneously respond to a user's prompt. The system automatically picks the best response as the winner.

### The Four Agents

| Agent | Name | Style | Temperature |
|-------|------|-------|-------------|
| 1 | The Analyst | Cold analyst, finds the flaw in everything | 0.2 |
| 2 | The Philosopher | First-principles thinker, questions the premise | 0.7 |
| 3 | The Pragmatist | Street-smart pragmatist, only cares what works | 0.5 |
| 4 | The Contrarian | Genuine contrarian, says what others won't | 1.0 |

## Tech Stack

- **Backend**: Python 3.13 + FastAPI
- **Frontend**: React + TypeScript + Tailwind CSS
- **LLM**: Claude API (Anthropic)

## Getting Started

### Prerequisites

- Python 3.13+
- Node.js 18+
- Anthropic API key

### Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY

# Run the server
python main.py
```

The API will be available at `http://localhost:8000`.

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Run development server
npm run dev
```

The frontend will be available at `http://localhost:5173`.

## API Endpoints

### POST /api/prompt

Submit a prompt to all 4 agents.

**Request:**
```json
{
  "prompt": "Your question here",
  "session_id": "optional-session-id"
}
```

**Response:**
```json
{
  "session_id": "uuid",
  "prompt": "Your question here",
  "winner": { ... },
  "winner_agent_id": "agent_1",
  "all_responses": [ ... ],
  "timestamp": "ISO datetime"
}
```

### GET /api/health

Health check endpoint.

## Project Structure

```
Multi-Agents/
├── backend/
│   ├── arena/
│   │   ├── core/
│   │   │   ├── agents.py      # Agent definitions
│   │   │   ├── orchestrator.py # Parallel fan-out
│   │   │   └── scorer.py      # Response scoring
│   │   ├── models/
│   │   │   └── schemas.py     # Pydantic models
│   │   ├── routes/
│   │   │   └── prompt.py      # API endpoints
│   │   └── config.py          # Settings
│   ├── main.py                # FastAPI app
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── App.tsx
│   │   ├── api.ts
│   │   └── types.ts
│   └── package.json
└── README.md
```

## License

Private project.
