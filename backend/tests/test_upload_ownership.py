"""Upload registry ownership — attachment IDOR guard.

file_id values are UUIDs returned from POST /api/agent/upload. Without
binding each record to the uploader, any authenticated user who learns
another user's file_id could pass it as attachment_ids and inject
private PDF/image content into their own agent run.
"""

from __future__ import annotations

import pytest

from arena.core import upload_store


@pytest.fixture(autouse=True)
def _clean_registry():
    upload_store.clear_uploads()
    yield
    upload_store.clear_uploads()


def test_register_requires_user_id():
    with pytest.raises(ValueError, match="user_id"):
        upload_store.register_upload("f1", {"content": "x"}, user_id="")


def test_owner_can_resolve_own_upload():
    upload_store.register_upload(
        "file-a",
        {"content": "secret-a", "filename": "a.txt"},
        user_id=1,
    )
    got = upload_store.resolve_attachments(["file-a"], user_id=1)
    assert len(got) == 1
    assert got[0]["content"] == "secret-a"
    assert got[0]["user_id"] == "1"


def test_foreign_user_cannot_resolve_upload():
    """Classic IDOR: user 2 must not receive user 1's attachment content."""
    upload_store.register_upload(
        "file-victim",
        {"content": "victim-private-pdf-text", "b64": "AAAA", "filename": "secret.pdf"},
        user_id=1,
    )
    # Attacker presents the known file_id under their own account.
    got = upload_store.resolve_attachments(["file-victim"], user_id=2)
    assert got == []


def test_mixed_ids_only_return_owned():
    upload_store.register_upload("mine", {"content": "ok"}, user_id=42)
    upload_store.register_upload("theirs", {"content": "nope"}, user_id=99)
    got = upload_store.resolve_attachments(
        ["theirs", "mine", "missing", "theirs"],
        user_id=42,
    )
    assert [r["content"] for r in got] == ["ok"]


def test_get_upload_enforces_owner_when_user_id_passed():
    upload_store.register_upload("f", {"content": "x"}, user_id=7)
    assert upload_store.get_upload("f", user_id=7) is not None
    assert upload_store.get_upload("f", user_id=8) is None
    # Internal/unscoped read still works for tests
    assert upload_store.get_upload("f") is not None


def test_resolve_with_empty_user_id_returns_nothing():
    upload_store.register_upload("f", {"content": "x"}, user_id=1)
    assert upload_store.resolve_attachments(["f"], user_id="") == []
    assert upload_store.resolve_attachments(["f"], user_id=None) == []  # type: ignore[arg-type]
