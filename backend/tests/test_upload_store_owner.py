"""Regression tests for ``_normalize_owner`` + ``register_upload`` owner contract.

The owner normalization sits in front of every upload read/write. The
contract: ``register_upload`` MUST refuse to store an upload without an
owner (anonymous uploads are never allowed — the agent upload route is
auth-gated), and ``_normalize_owner`` MUST return ``None`` for any
input that cannot be coerced to a non-empty string.

Pins:
  - ``register_upload(user_id=None)`` raises ``ValueError`` (no
    anonymous uploads, ever).
  - ``register_upload(user_id="")`` raises ``ValueError`` (whitespace
    only, after strip, is also anonymous).
  - ``_normalize_owner`` handles int / str / whitespace-only / None.
  - The registered record's ``user_id`` is the NORMALIZED form (string
    + stripped) — never the raw input.
  - Two callers cannot share a record by passing equivalent-but-not-
    identical IDs (``"42"`` vs ``42`` vs ``" 42 "`` all stamp the same
    owner).
"""

from __future__ import annotations

import pytest

from arena.core.upload_store import _normalize_owner, register_upload


class TestNormalizeOwner:
    def test_int_returns_string_form(self):
        assert _normalize_owner(42) == "42"

    def test_str_returns_stripped(self):
        assert _normalize_owner("abc") == "abc"

    def test_str_with_surrounding_whitespace_is_stripped(self):
        assert _normalize_owner("  42  ") == "42"
        assert _normalize_owner("\tabc\n") == "abc"

    def test_none_returns_none(self):
        assert _normalize_owner(None) is None

    def test_empty_string_returns_none(self):
        assert _normalize_owner("") is None

    def test_whitespace_only_returns_none(self):
        """An empty-after-strip string must NOT coerce to ``"None"`` or
        ``""`` — it must round-trip to ``None`` so the caller can detect
        the anonymous case."""
        assert _normalize_owner("   ") is None
        assert _normalize_owner("\t\n") is None


class TestRegisterUploadRejectsAnonymous:
    def test_none_user_id_raises(self):
        with pytest.raises(ValueError) as exc:
            register_upload(
                file_id="anon-1",
                record={"filename": "f.txt", "size": 1},
                user_id=None,
            )
        assert "user_id is required" in str(exc.value)

    def test_empty_string_user_id_raises(self):
        with pytest.raises(ValueError):
            register_upload(
                file_id="anon-2",
                record={"filename": "f.txt", "size": 1},
                user_id="",
            )

    def test_whitespace_only_user_id_raises(self):
        with pytest.raises(ValueError):
            register_upload(
                file_id="anon-3",
                record={"filename": "f.txt", "size": 1},
                user_id="   ",
            )


class TestRegisterUploadStampsNormalizedOwner:
    def test_stamps_string_form_of_int_owner(self):
        register_upload(
            file_id="owner-int-1",
            record={"filename": "f.txt", "size": 1},
            user_id=42,
        )
        from arena.core.upload_store import get_upload
        rec = get_upload("owner-int-1")
        assert rec is not None
        assert rec["user_id"] == "42"

    def test_stamps_stripped_string_owner(self):
        register_upload(
            file_id="owner-str-1",
            record={"filename": "f.txt", "size": 1},
            user_id="  42  ",
        )
        from arena.core.upload_store import get_upload
        rec = get_upload("owner-str-1")
        assert rec is not None
        assert rec["user_id"] == "42"  # whitespace stripped

    def test_equivalent_ids_share_records(self):
        """``42``, ``"42"``, ``" 42 "`` all normalize to ``"42"`` — a
        caller who retrieves the upload with any equivalent form must
        find the same record."""
        register_upload(
            file_id="equiv-1",
            record={"filename": "f.txt", "size": 1},
            user_id=42,
        )
        from arena.core.upload_store import get_upload
        # Read with the int form.
        rec_int = get_upload("equiv-1", user_id=42)
        # Read with the string form.
        rec_str = get_upload("equiv-1", user_id="42")
        # Read with the whitespace-padded form.
        rec_padded = get_upload("equiv-1", user_id="  42  ")
        assert rec_int is not None
        assert rec_str is not None
        assert rec_padded is not None
        assert rec_int["user_id"] == rec_str["user_id"] == rec_padded["user_id"] == "42"


class TestRegisterUploadStoresFileIdAndCreatedAt:
    def test_overrides_created_at_with_current_time(self):
        register_upload(
            file_id="time-1",
            record={"filename": "f.txt", "size": 1, "created_at": 0.0},
            user_id=42,
        )
        from arena.core.upload_store import get_upload
        rec = get_upload("time-1")
        assert rec is not None
        # A 0.0 created_at must be overwritten with the current time
        # (falsy value triggers ``float(... or time.time())``).
        assert rec["created_at"] > 0.0

    def test_preserves_provided_created_at(self):
        # Use a recent timestamp (TTL is 2 hours, so anything within the
        # last few minutes survives the lazy purge in get_upload).
        import time
        recent = time.time() - 60  # 1 minute ago — well within TTL
        register_upload(
            file_id="time-2",
            record={"filename": "f.txt", "size": 1, "created_at": recent},
            user_id=42,
        )
        from arena.core.upload_store import get_upload
        rec = get_upload("time-2")
        assert rec is not None
        # The provided recent timestamp is preserved (within tolerance).
        assert abs(rec["created_at"] - recent) < 1.0