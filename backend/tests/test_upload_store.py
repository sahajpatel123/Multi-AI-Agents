"""Tests for the ephemeral upload registry.

upload_store maintains the /tmp/arena_uploads registry of Agent file
attachments. Drift here means either:
  - attachment IDOR (one user accessing another's upload)
  - unbounded memory / disk growth from upload spam
  - safe_unlink accidentally deleting files outside the upload root
  - purge_expired never removing stale records (TTL leaks)

We pin the pure helpers + the safe_unlink containment check.
"""
from __future__ import annotations

import os
import tempfile
from pathlib import Path

import pytest

from arena.core import upload_store
from arena.core.upload_store import (
    UPLOAD_TTL_SECONDS,
    _normalize_owner,
    purge_expired,
    registry_size,
)


@pytest.fixture(autouse=True)
def _reset_registry():
    """Each test starts with a clean registry + a clean /tmp/arena_uploads."""
    upload_store._UPLOADS.clear()
    yield
    upload_store._UPLOADS.clear()


# ── _normalize_owner ──────────────────────────────────────────────


def test_normalize_owner_returns_none_for_none() -> None:
    assert _normalize_owner(None) is None


def test_normalize_owner_stringifies_int() -> None:
    assert _normalize_owner(42) == "42"


def test_normalize_owner_passes_through_string() -> None:
    assert _normalize_owner("user-abc") == "user-abc"


def test_normalize_owner_strips_whitespace() -> None:
    assert _normalize_owner("  42  ") == "42"


def test_normalize_owner_treats_whitespace_only_as_none() -> None:
    # Empty / whitespace-only user_id is treated as None — this would
    # never happen in practice (route requires auth) but the helper is
    # forgiving.
    assert _normalize_owner("   ") is None
    assert _normalize_owner("") is None


# ── purge_expired + registry_size ─────────────────────────────────


def test_purge_expired_on_empty_registry_returns_zero() -> None:
    assert purge_expired() == 0


def test_purge_expired_drops_records_older_than_ttl() -> None:
    now = 1_700_000_000.0
    # Insert two records: one old (older than TTL), one fresh.
    upload_store._UPLOADS["old"] = {"created_at": now - UPLOAD_TTL_SECONDS - 60, "user_id": 1}
    upload_store._UPLOADS["new"] = {"created_at": now - 60, "user_id": 1}
    removed = purge_expired(now=now)
    assert removed == 1
    assert "old" not in upload_store._UPLOADS
    assert "new" in upload_store._UPLOADS


def test_purge_expired_uses_injected_now_when_provided() -> None:
    # Pin now via the kwarg — without it, time.time() drifts.
    now = 1_700_000_000.0
    upload_store._UPLOADS["edge"] = {"created_at": now - UPLOAD_TTL_SECONDS + 1, "user_id": 1}
    # One second before TTL boundary → not expired
    removed = purge_expired(now=now)
    assert removed == 0
    assert "edge" in upload_store._UPLOADS
    # One second after TTL boundary → expired
    removed = purge_expired(now=now + 2)
    assert removed == 1


def test_purge_expired_treats_zero_or_missing_created_at_as_old() -> None:
    # A record with created_at=0 or missing is older than any cutoff →
    # purge_expired removes it.
    now = 1_700_000_000.0
    upload_store._UPLOADS["zero"] = {"created_at": 0, "user_id": 1}
    upload_store._UPLOADS["missing"] = {"user_id": 1}
    upload_store._UPLOADS["none"] = {"created_at": None, "user_id": 1}
    removed = purge_expired(now=now)
    assert removed == 3


def test_registry_size_reflects_current_state() -> None:
    assert registry_size() == 0
    upload_store._UPLOADS["a"] = {"created_at": 0, "user_id": 1}
    upload_store._UPLOADS["b"] = {"created_at": 0, "user_id": 1}
    assert registry_size() == 2


# ── _safe_unlink containment ──────────────────────────────────────


def test_safe_unlink_is_noop_for_none_path() -> None:
    # Must never raise even when path is None.
    upload_store._safe_unlink(None)
    upload_store._safe_unlink("")


def test_safe_unlink_skips_files_outside_upload_root(tmp_path) -> None:
    # The path-containment guard prevents path-traversal: a record with
    # `path = /etc/passwd` must NOT be deleted even if it exists.
    outside_file = tmp_path / "outside.txt"
    outside_file.write_text("do not delete")
    upload_store._safe_unlink(str(outside_file))
    assert outside_file.exists(), "File outside UPLOAD_DIR must not be deleted"


def test_safe_unlink_deletes_files_inside_upload_root(tmp_path, monkeypatch) -> None:
    # When UPLOAD_DIR is patched to tmp_path, files inside it must be deleted.
    inside = tmp_path / "inside.txt"
    inside.write_text("delete me")
    monkeypatch.setattr(upload_store, "UPLOAD_DIR", str(tmp_path))
    upload_store._safe_unlink(str(inside))
    assert not inside.exists(), "File inside UPLOAD_DIR must be deleted"


def test_safe_unlink_handles_nonexistent_paths_gracefully() -> None:
    # Must not raise on missing files — best-effort semantics.
    upload_store._safe_unlink("/tmp/this-does-not-exist-12345")


def test_safe_unlink_handles_path_traversal_attempt(tmp_path, monkeypatch) -> None:
    # The root-containment check uses resolve() + relative_to(). A
    # sibling directory whose name STARTS WITH the upload root prefix
    # (e.g. /tmp/arena_uploads_evil/...) must NOT be deleted.
    upload_root = tmp_path / "arena_uploads"
    evil_root = tmp_path / "arena_uploads_evil"
    upload_root.mkdir()
    evil_root.mkdir()
    evil_file = evil_root / "stolen.txt"
    evil_file.write_text("don't delete")
    monkeypatch.setattr(upload_store, "UPLOAD_DIR", str(upload_root))
    # Try to delete a file inside the sibling directory; resolve() +
    # relative_to(root) must reject it.
    upload_store._safe_unlink(str(evil_file))
    assert evil_file.exists(), "Sibling directory outside UPLOAD_DIR must not be deleted"
