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

# Ensure backend is on sys.path so `from arena...` works.
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


@pytest.fixture(autouse=True)
def _reset_rate_limiters():
    """Reset slowapi + InMemoryRateLimiter buckets between tests so
    tests added in the same run don't trip the per-IP 20/hour limit on
    /api/auth/refresh. The InMemoryRateLimiter is module-level state in
    arena.core.rate_limits; slowapi's Limiter keeps its own in-memory
    storage on the ._storage / ._limiter attributes.
    """
    from arena.core import rate_limits
    from arena.core.login_limiter import login_limiter, registration_limiter

    rate_limits.rate_limiter._events.clear()
    login_limiter.reset()
    registration_limiter.reset()
    try:
        from arena.routes import auth as auth_routes

        for attr in ("_storage", "_limiter", "_rate_storage", "_check_storage"):
            storage = getattr(auth_routes.limiter, attr, None)
            if storage is not None and hasattr(storage, "reset"):
                storage.reset()
    except Exception:
        # Don't let fixture teardown mask real test failures; if reset
        # fails, tests will still run, just with shared state.
        pass
    yield
    rate_limits.rate_limiter._events.clear()
    login_limiter.reset()
    registration_limiter.reset()


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

    Mirrors the real client's shape: client.messages is an attribute returning
    a Messages resource, and the resource exposes .create(...).
    """

    def __init__(self, response_text: str = '{"verdict": "ok", "one_liner": "ok", "confidence": 50, "key_assumption": "test"}'):
        self.response_text = response_text
        self.calls: list[dict] = []
        self.messages = _StubMessagesResource(self)


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
    from arena.core import model_router
    # MODEL_REGISTRY was built at import time with the real client reference;
    # patch the dict entries directly so route lookups see the stub.
    for key in ("claude_haiku", "claude_sonnet", "claude_opus"):
        if key in model_router.MODEL_REGISTRY:
            monkeypatch.setitem(model_router.MODEL_REGISTRY[key], "client", client)
    yield client


class _StubMessagesResource:
    """Mimics anthropic's `client.messages` resource object."""

    def __init__(self, parent: "StubAnthropicClient"):
        self._parent = parent

    async def create(self, **kwargs):
        self._parent.calls.append(kwargs)

        class _Resp:
            def __init__(self, text):
                self.content = [type("Block", (), {"text": text})()]
                self.usage = type("Usage", (), {"input_tokens": 10, "output_tokens": 10})()

        return _Resp(self._parent.response_text)


@pytest.fixture
def stub_openai(monkeypatch):
    client = StubOpenAIClient()
    from arena.core import model_router
    monkeypatch.setattr("arena.core.model_router.openai_client", client, raising=False)
    monkeypatch.setattr("arena.core.model_router.grok_client", client, raising=False)
    monkeypatch.setattr("arena.core.model_router.deepseek_client", client, raising=False)
    # Patch OpenAI/Grok/DeepSeek model registry entries too
    for key in ("gpt_4o", "gpt_4o_mini", "grok_3", "grok_3_mini", "grok", "deepseek_v3"):
        if key in model_router.MODEL_REGISTRY:
            monkeypatch.setitem(model_router.MODEL_REGISTRY[key], "client", client)
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

class _MagicStub:
    """Placeholder for python-magic so tests don't need libmagic installed."""

    def from_buffer(self, _buf):
        return "application/octet-stream"

    def from_file(self, _path):
        return "application/octet-stream"


@pytest.fixture(autouse=True)
def _stub_python_magic(monkeypatch):
    """python-magic requires libmagic at import time. The CI image doesn't ship
    it, so inject a stub before any route module imports file_ingest."""
    import sys
    import types
    fake = types.ModuleType("magic")
    fake.Magic = lambda *a, **kw: _MagicStub()
    fake.from_buffer = lambda *a, **kw: "application/octet-stream"
    fake.from_file = lambda *a, **kw: "application/octet-stream"
    monkeypatch.setitem(sys.modules, "magic", fake)


@pytest.fixture
async def app_client(isolated_db, monkeypatch):
    """httpx.AsyncClient wired to the FastAPI app with DB overridden."""
    import httpx
    from arena.database import get_db
    from arena.config import Settings as _Settings
    from arena.core.seed_personas import seed_persona_library

    # Skip startup validation so SQLite test URLs and stub keys don't trip the
    # production hard-fail guards in settings.validate_secrets.
    monkeypatch.setattr(_Settings, "validate_secrets", lambda self: None)
    monkeypatch.setattr(_Settings, "validate_api_keys", lambda self: None)

    # main.py lives at backend/main.py, not inside the arena package.
    from main import create_app

    SessionLocal = isolated_db

    def _override_get_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app = create_app()
    app.dependency_overrides[get_db] = _override_get_db

    # httpx's ASGITransport does not fire lifespan events — manually seed
    # the persona library so tests can hit /api/personas etc.
    seed_db = SessionLocal()
    try:
        # seed_persona_library is async but does only sync DB work internally;
        # calling it from the event loop is fine (no asyncio.run() needed).
        await seed_persona_library(seed_db)
    finally:
        seed_db.close()

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        yield client

    app.dependency_overrides.clear()