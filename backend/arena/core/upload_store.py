"""Ephemeral upload registry for Agent file attachments (single-process /tmp).

Security:
1. Ownership — every registration is bound to the uploading user's id.
   Resolve paths must pass the caller's user_id and only return records
   that user owns (attachment IDOR).
2. Resource bounds — without caps an authenticated user can fill process
   memory (each image stores base64) and /tmp disk by spamming
   POST /api/agent/upload. We enforce:
   - per-user max live uploads
   - global max live uploads
   - TTL so abandoned attachments expire
   Best-effort deletion of the sandbox file when a record is evicted.
"""

from __future__ import annotations

import logging
import os
import time
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

UPLOAD_DIR = "/tmp/arena_uploads"

# file_id -> full attachment record (includes content, optional b64, user_id)
_UPLOADS: dict[str, dict[str, Any]] = {}

# Caps — small enough that a single worker cannot be OOM'd by upload spam,
# large enough for multi-file agent tasks (up to 32 attachment_ids on run).
MAX_UPLOADS_PER_USER = 32
MAX_UPLOADS_GLOBAL = 256
# Attachments are only needed between upload and the subsequent /run;
# two hours is generous for a user who walks away mid-compose.
UPLOAD_TTL_SECONDS = 2 * 60 * 60


def _normalize_owner(user_id: int | str | None) -> str | None:
    if user_id is None:
        return None
    s = str(user_id).strip()
    return s if s else None


def _safe_unlink(path: str | None) -> None:
    """Best-effort delete of a sandbox file. Never raises to callers."""
    if not path:
        return
    try:
        p = Path(path)
        # Only unlink files that still resolve under the upload root.
        root = Path(UPLOAD_DIR).resolve()
        resolved = p.expanduser().resolve()
        try:
            resolved.relative_to(root)
        except ValueError:
            return
        if resolved.is_file():
            resolved.unlink()
    except Exception as exc:  # pragma: no cover - filesystem edge
        logger.debug("upload_store unlink failed for %s: %s", path, exc)


def _evict_file_id(file_id: str) -> None:
    rec = _UPLOADS.pop(file_id, None)
    if rec:
        _safe_unlink(rec.get("path") if isinstance(rec, dict) else None)


def purge_expired(now: float | None = None) -> int:
    """Drop records older than UPLOAD_TTL_SECONDS. Returns count removed."""
    ts = time.time() if now is None else now
    cutoff = ts - UPLOAD_TTL_SECONDS
    expired = [
        fid
        for fid, rec in list(_UPLOADS.items())
        if float(rec.get("created_at") or 0) < cutoff
    ]
    for fid in expired:
        _evict_file_id(fid)
    return len(expired)


def _enforce_user_cap(owner: str) -> None:
    """If owner already has MAX_UPLOADS_PER_USER, drop their oldest first."""
    owned = [
        (fid, float(rec.get("created_at") or 0))
        for fid, rec in _UPLOADS.items()
        if _normalize_owner(rec.get("user_id")) == owner
    ]
    if len(owned) < MAX_UPLOADS_PER_USER:
        return
    owned.sort(key=lambda item: item[1])
    # Evict enough so there is room for one new registration.
    overflow = len(owned) - MAX_UPLOADS_PER_USER + 1
    for fid, _ in owned[:overflow]:
        _evict_file_id(fid)


def _enforce_global_cap() -> None:
    """If the registry is at the global ceiling, drop the oldest entries."""
    if len(_UPLOADS) < MAX_UPLOADS_GLOBAL:
        return
    ordered = sorted(
        ((fid, float(rec.get("created_at") or 0)) for fid, rec in _UPLOADS.items()),
        key=lambda item: item[1],
    )
    overflow = len(_UPLOADS) - MAX_UPLOADS_GLOBAL + 1
    for fid, _ in ordered[:overflow]:
        _evict_file_id(fid)


def register_upload(
    file_id: str,
    record: dict[str, Any],
    *,
    user_id: int | str,
) -> None:
    """Register an upload and stamp it with the owner user_id.

    `user_id` is required. Callers must never register anonymous uploads —
    the agent upload route is auth-gated.

    Also runs TTL purge and enforces per-user / global caps before insert.
    """
    owner = _normalize_owner(user_id)
    if not owner:
        raise ValueError("user_id is required to register an upload")

    purge_expired()
    _enforce_user_cap(owner)
    _enforce_global_cap()

    stored = dict(record)
    stored["user_id"] = owner
    stored["file_id"] = file_id
    stored["created_at"] = float(stored.get("created_at") or time.time())
    _UPLOADS[file_id] = stored


def get_upload(
    file_id: str,
    *,
    user_id: int | str | None = None,
) -> dict[str, Any] | None:
    """Return a registered upload, optionally enforcing owner match.

    When ``user_id`` is provided, only return the record if it belongs to
    that user. When omitted, return the raw record (test/internal use only).
    Expired records are purged lazily on read.
    """
    purge_expired()
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
    purge_expired()
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


def registry_size() -> int:
    """Current live upload count (tests / diagnostics)."""
    return len(_UPLOADS)


def clear_uploads() -> None:
    """Drop the in-process registry (tests only). Does not touch disk."""
    _UPLOADS.clear()


def ensure_upload_dir() -> None:
    os.makedirs(UPLOAD_DIR, mode=0o700, exist_ok=True)
