"""Ephemeral upload registry for Agent file attachments (single-process /tmp).

Security: every registration is bound to the uploading user's id. Resolve
paths must pass the caller's user_id and only return records that user owns.
Without this, any authenticated client that learns another user's file_id
(UUID in the upload response, logs, or XSS) could attach private PDF/image
content to their own agent run (attachment IDOR).
"""

from __future__ import annotations

import os
from typing import Any

UPLOAD_DIR = "/tmp/arena_uploads"

# file_id -> full attachment record (includes content, optional b64, user_id)
_UPLOADS: dict[str, dict[str, Any]] = {}


def _normalize_owner(user_id: int | str | None) -> str | None:
    if user_id is None:
        return None
    s = str(user_id).strip()
    return s if s else None


def register_upload(
    file_id: str,
    record: dict[str, Any],
    *,
    user_id: int | str,
) -> None:
    """Register an upload and stamp it with the owner user_id.

    `user_id` is required. Callers must never register anonymous uploads —
    the agent upload route is auth-gated.
    """
    owner = _normalize_owner(user_id)
    if not owner:
        raise ValueError("user_id is required to register an upload")
    stored = dict(record)
    stored["user_id"] = owner
    stored["file_id"] = file_id
    _UPLOADS[file_id] = stored


def get_upload(
    file_id: str,
    *,
    user_id: int | str | None = None,
) -> dict[str, Any] | None:
    """Return a registered upload, optionally enforcing owner match.

    When ``user_id`` is provided, only return the record if it belongs to
    that user. When omitted, return the raw record (test/internal use only).
    """
    rec = _UPLOADS.get(file_id)
    if rec is None:
        return None
    if user_id is not None:
        owner = _normalize_owner(rec.get("user_id"))
        caller = _normalize_owner(user_id)
        if not owner or owner != caller:
            return None
    return rec


def resolve_attachments(
    file_ids: list[str],
    *,
    user_id: int | str,
) -> list[dict[str, Any]]:
    """Resolve attachment ids for a task, scoped to the caller's ownership.

    Unknown ids and foreign-owned ids are silently skipped (same as a
    missing id) so we do not leak existence of other users' uploads via
    error shape. Caller still gets only what they legitimately uploaded.
    """
    owner = _normalize_owner(user_id)
    if not owner:
        return []

    out: list[dict[str, Any]] = []
    for fid in file_ids:
        if not fid:
            continue
        rec = _UPLOADS.get(str(fid))
        if not rec:
            continue
        if _normalize_owner(rec.get("user_id")) != owner:
            # IDOR attempt or stale id — do not attach foreign content.
            continue
        out.append(rec)
    return out


def clear_uploads() -> None:
    """Drop the in-process registry (tests only)."""
    _UPLOADS.clear()


def ensure_upload_dir() -> None:
    os.makedirs(UPLOAD_DIR, mode=0o700, exist_ok=True)
