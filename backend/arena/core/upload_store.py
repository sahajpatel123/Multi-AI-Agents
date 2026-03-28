"""Ephemeral upload registry for Agent file attachments (single-process /tmp)."""

from __future__ import annotations

import os
from typing import Any

UPLOAD_DIR = "/tmp/arena_uploads"

# file_id -> full attachment record (includes content, optional b64)
_UPLOADS: dict[str, dict[str, Any]] = {}


def register_upload(file_id: str, record: dict[str, Any]) -> None:
    _UPLOADS[file_id] = record


def get_upload(file_id: str) -> dict[str, Any] | None:
    return _UPLOADS.get(file_id)


def resolve_attachments(file_ids: list[str]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for fid in file_ids:
        rec = _UPLOADS.get(fid)
        if rec:
            out.append(rec)
    return out


def ensure_upload_dir() -> None:
    os.makedirs(UPLOAD_DIR, mode=0o700, exist_ok=True)
