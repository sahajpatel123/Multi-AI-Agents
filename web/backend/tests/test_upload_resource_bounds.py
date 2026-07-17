"""Upload registry resource bounds — memory/disk DoS guard.

Authenticated upload spam can fill process memory (image base64) and
/tmp. Caps + TTL + per-user rate limits close that amplification path.
"""

from __future__ import annotations

import time

import pytest

from arena.core import upload_store


@pytest.fixture(autouse=True)
def _clean_registry(monkeypatch):
    upload_store.clear_uploads()
    # Keep caps small so tests stay fast and deterministic.
    monkeypatch.setattr(upload_store, "MAX_UPLOADS_PER_USER", 3)
    monkeypatch.setattr(upload_store, "MAX_UPLOADS_GLOBAL", 5)
    monkeypatch.setattr(upload_store, "UPLOAD_TTL_SECONDS", 3600)
    yield
    upload_store.clear_uploads()


def _fresh(offset: float = 0.0) -> float:
    """created_at within the TTL window (newest = larger offset)."""
    return time.time() + offset


def test_per_user_cap_evicts_oldest():
    for i in range(4):
        upload_store.register_upload(
            f"u1-{i}",
            {"content": f"c{i}", "created_at": _fresh(i)},
            user_id=1,
        )
    # Cap is 3 — oldest (u1-0) must be gone; newest three remain.
    assert upload_store.get_upload("u1-0") is None
    assert upload_store.get_upload("u1-1") is not None
    assert upload_store.get_upload("u1-2") is not None
    assert upload_store.get_upload("u1-3") is not None
    assert upload_store.registry_size() == 3


def test_per_user_cap_does_not_evict_other_users():
    upload_store.register_upload(
        "a", {"content": "a", "created_at": _fresh(1)}, user_id=1
    )
    upload_store.register_upload(
        "b", {"content": "b", "created_at": _fresh(2)}, user_id=1
    )
    upload_store.register_upload(
        "c", {"content": "c", "created_at": _fresh(3)}, user_id=1
    )
    # User 2 registers — must not drop user 1's files via user-cap path.
    upload_store.register_upload(
        "d", {"content": "d", "created_at": _fresh(4)}, user_id=2
    )
    assert upload_store.get_upload("a", user_id=1) is not None
    assert upload_store.get_upload("d", user_id=2) is not None


def test_global_cap_evicts_oldest_across_users():
    # Fill past global cap (5) with distinct users so per-user cap never fires.
    for i in range(6):
        upload_store.register_upload(
            f"g-{i}",
            {"content": f"c{i}", "created_at": _fresh(i)},
            user_id=100 + i,
        )
    assert upload_store.get_upload("g-0") is None  # oldest evicted
    assert upload_store.registry_size() == 5


def test_ttl_purges_stale_records(monkeypatch):
    monkeypatch.setattr(upload_store, "UPLOAD_TTL_SECONDS", 60)
    now = time.time()
    upload_store.register_upload(
        "stale",
        {"content": "old", "created_at": now - 120},
        user_id=1,
    )
    upload_store.register_upload(
        "fresh",
        {"content": "new", "created_at": now},
        user_id=1,
    )
    # register_upload calls purge_expired — stale should be gone.
    assert upload_store.get_upload("stale") is None
    assert upload_store.get_upload("fresh") is not None


def test_resolve_still_ownership_scoped_after_bounds():
    upload_store.register_upload(
        "mine", {"content": "ok", "created_at": _fresh()}, user_id=7
    )
    upload_store.register_upload(
        "theirs", {"content": "no", "created_at": _fresh(1)}, user_id=8
    )
    got = upload_store.resolve_attachments(["mine", "theirs"], user_id=7)
    assert [r["content"] for r in got] == ["ok"]


def test_safe_unlink_ignores_paths_outside_sandbox(tmp_path, monkeypatch):
    outside = tmp_path / "outside.txt"
    outside.write_text("do-not-delete")
    sandbox = tmp_path / "arena_uploads"
    sandbox.mkdir()
    monkeypatch.setattr(upload_store, "UPLOAD_DIR", str(sandbox))

    upload_store.register_upload(
        "evil-path",
        {
            "content": "x",
            "path": str(outside),
            "created_at": _fresh(0),
        },
        user_id=1,
    )
    # Force per-user eviction of evil-path by filling the cap.
    for i in range(3):
        upload_store.register_upload(
            f"fill-{i}",
            {"content": f"{i}", "created_at": _fresh(10 + i)},
            user_id=1,
        )
    # Outside file must still exist — unlink refused to leave sandbox.
    assert outside.read_text() == "do-not-delete"
    assert upload_store.get_upload("evil-path") is None
