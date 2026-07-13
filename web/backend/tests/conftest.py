"""Pytest fixtures shared across the test suite.

Goals:
- Use isolated SQLite (in-memory) so tests don't touch real DB.
- Replace external LLM clients with lightweight stubs.
- Provide an httpx AsyncClient wired to the FastAPI app with DB override.
"""

from __future__ import annotations

import os
import sys
import asyncio
import contextlib
from typing import Iterator, AsyncIterator

import pytest

# Ensure web/backend is on sys.path so `from arena...` works.
_BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
if _BACKEND_ROOT not in sys.path:
    sys.path.insert(0, _BACKEND_ROOT)


# ─── Required env before importing app modules ─────────────────────────────
os.environ.setdefault("SECRET_KEY", "test-secret-key-" + "x" * 32)
os.environ.setdefault("ANTHROPIC_API_KEY", "sk-ant-test-fake-key-for-pytest")
os.environ.setdefault("OPENAI_API_KEY", "sk-test-fake-key-for-pytest")
os.environ.setdefault("ALLOWED_ORIGINS", "http://localhost:5173")
os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")


@pytest.fixture(scope="session")
def event_loop():
    """Session-scoped event loop so async fixtures share one loop."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(autouse=True)
def _reset_settings_cache():
    """Clear lru_cache on get_settings between tests when env mutates."""
    from arena import config

    config.get_settings.cache_clear()
    yield
    config.get_settings.cache_clear()


@pytest.fixture
def isolated_db(monkeypatch) -> Iterator:
    """Per-test SQLite engine + tables.

    Uses StaticPool so the in-memory DB is shared across sessions in the same
    thread (necessary for SQLAlchemy 2 with check_same_thread=False).
    """
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool

    from arena import db_models  # noqa: F401 — registers tables on Base
    from arena.database import Base

    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    monkeypatch.setattr("arena.database.engine", engine, raising=False)
    monkeypatch.setattr("arena.database.SessionLocal", SessionLocal, raising=False)

    yield SessionLocal

    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture
def db_session(isolated_db) -> Iterator:
    SessionLocal = isolated_db
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


# ─── LLM client stubs ──────────────────────────────────────────────────────

class StubAnthropicClient:
    """Minimal async stand-in for anthropic.AsyncAnthropic.messages.create.

    Returns a fixed JSON body so callers that parse it can proceed.
    """

    def __init__(self, response_text: str = '{"verdict": "ok", "one_liner": "ok", "confidence": 50, "key_assumption": "test"}'):
        self.response_text = response_text
        self.calls: list[dict] = []

    async def messages(self, **kwargs):
        return self

    async def create(self, **kwargs):
        self.calls.append(kwargs)

        class _Resp:
            def __init__(self, text):
                self.content = [type("Block", (), {"text": text})()]
                self.usage = type("Usage", (), {"input_tokens": 10, "output_tokens": 10})()

        return _Resp(self.response_text)


class StubOpenAIClient:
    """Minimal async stand-in for openai.chat.completions.create."""

    def __init__(self, response_text: str = "ok"):
        self.response_text = response_text
        self.calls: list[dict] = []

    async def create(self, **kwargs):
        self.calls.append(kwargs)

        class _Choice:
            def __init__(self, text):
                self.message = type("Msg", (), {"content": text})()

        class _Resp:
            def __init__(self, text):
                self.choices = [_Choice(text)]
                self.usage = type("Usage", (), {"prompt_tokens": 10, "completion_tokens": 10})()

        return _Resp(self.response_text)


@pytest.fixture
def stub_anthropic(monkeypatch):
    client = StubAnthropicClient()
    monkeypatch.setattr("arena.core.model_router.claude_client", client, raising=False)
    yield client


@pytest.fixture
def stub_openai(monkeypatch):
    client = StubOpenAIClient()
    monkeypatch.setattr("arena.core.model_router.openai_client", client, raising=False)
    monkeypatch.setattr("arena.core.model_router.grok_client", client, raising=False)
    monkeypatch.setattr("arena.core.model_router.deepseek_client", client, raising=False)
    yield client


# ─── Auth helper ───────────────────────────────────────────────────────────

@pytest.fixture
def make_user(isolated_db):
    """Factory that creates a User with the given tier."""

    from arena.db_models import User, UserTier
    from arena.core.auth import hash_password

    SessionLocal = isolated_db

    def _make(
        email: str = "user@test.com",
        tier: UserTier = UserTier.FREE,
        password: str = "Strong1Pass",
        prompt_count_today: int = 0,
        prompt_count_reset_at=None,
    ) -> User:
        from datetime import datetime, timezone
        session = SessionLocal()
        try:
            u = User(
                email=email,
                password_hash=hash_password(password),
                name="Tester",
                tier=tier,
                prompt_count_today=prompt_count_today,
                prompt_count_reset_at=prompt_count_reset_at or datetime.now(timezone.utc).replace(tzinfo=None),
                expertise_level="curious",
                expertise_domain="",
            )
            session.add(u)
            session.commit()
            session.refresh(u)
            return u
        finally:
            session.close()

    return _make


@pytest.fixture
def auth_headers(make_user):
    """Return a headers dict {"Authorization": "Bearer ..."} for the given user."""
    from arena.core.auth import create_access_token

    user = make_user()

    def _headers(for_user=None):
        u = for_user or user
        token = create_access_token(u.id, u.email)
        return {"Authorization": f"Bearer {token}"}

    return _headers


# ─── AsyncClient for FastAPI endpoint tests ────────────────────────────────

@pytest.fixture
async def app_client(isolated_db, monkeypatch):
    """httpx.AsyncClient wired to the FastAPI app with DB overridden."""
    import httpx
    from arena.database import get_db
    from arena.main import create_app

    SessionLocal = isolated_db

    def _override_get_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app = create_app()
    app.dependency_overrides[get_db] = _override_get_db

    # Replace lifespan-dependent tasks that would otherwise try to hit external
    # services (Razorpay, etc.).
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        yield client

    app.dependency_overrides.clear()