"""Integration tests for POST /api/agent/upload."""

from __future__ import annotations

import pytest

from arena.db_models import UserTier




@pytest.mark.asyncio
async def test_upload_requires_auth(app_client):
    res = await app_client.post(
        "/api/agent/upload",
        files={"file": ("test.txt", b"hello", "text/plain")},
    )
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_upload_403_for_free_tier(app_client, make_user):
    user = make_user(email="upload-free@test.com", tier=UserTier.FREE)
    res = await app_client.post(
        "/api/agent/upload",
        headers=_pro_headers(user),
        files={"file": ("test.txt", b"hello", "text/plain")},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_upload_rejects_oversize_file(app_client, make_user):
    """A file over the 10MB cap returns 413 before the in-memory registry sees it."""
    user = make_user(email="upload-big@test.com", tier=UserTier.PRO)
    huge = b"x" * (11 * 1024 * 1024)  # 11 MB > 10 MB cap
    res = await app_client.post(
        "/api/agent/upload",
        headers=_pro_headers(user),
        files={"file": ("huge.bin", huge, "application/octet-stream")},
    )
    assert res.status_code == 413
    assert "max 10MB" in res.text


@pytest.mark.asyncio
async def test_upload_accepts_small_file(app_client, make_user, monkeypatch):
    """Mock file_ingest entirely so the upload returns the expected
    file_id + filename shape without needing a real PDF."""
    import uuid

    from arena.core import file_ingest, upload_store
    from arena.routes import agent as agent_routes

    fake_meta = {
        "file_id": str(uuid.uuid4()),
        "filename": "hello.pdf",
        "size": 4,
        "content_type": "application/pdf",
    }

    def fake_process(*, filename, content_type, data, **_kwargs):
        # Don't call register_upload here — the route calls it
        # separately with the right signature. The fake only needs
        # to return a record the route can mutate.
        return {"type": "doc", "content": ""}

    monkeypatch.setattr(agent_routes, "process_upload", fake_process)
    monkeypatch.setattr(
        file_ingest.magic, "from_buffer", lambda *_a, **_k: "application/pdf"
    )

    user = make_user(email="upload-small@test.com", tier=UserTier.PRO)
    res = await app_client.post(
        "/api/agent/upload",
        headers=_pro_headers(user),
        files={"file": ("hello.pdf", b"%PDF-1.4 stub", "application/pdf")},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body.get("file_id")
    assert body.get("filename") == "hello.pdf"


@pytest.mark.asyncio
async def test_upload_returns_original_filename(app_client, make_user, monkeypatch):
    """The API echoes the original filename in the response (the
    internal `safe_name` lives in the storage path, not the API)."""
    from arena.core import file_ingest
    from arena.routes import agent as agent_routes

    def fake_process(*, filename, content_type, data, **_kwargs):
        return {"type": "doc", "content": ""}

    monkeypatch.setattr(agent_routes, "process_upload", fake_process)
    monkeypatch.setattr(
        file_ingest.magic, "from_buffer", lambda *_a, **_k: "application/pdf"
    )

    user = make_user(email="upload-name@test.com", tier=UserTier.PRO)
    res = await app_client.post(
        "/api/agent/upload",
        headers=_pro_headers(user),
        files={"file": ("../../../etc/passwd.pdf", b"%PDF-1.4 stub", "application/pdf")},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body.get("filename") == "../../../etc/passwd.pdf"
