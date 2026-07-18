"""Shared datetime helpers.

The codebase stores naive-UTC datetimes throughout (matches Base._now
in db_models.py and the wire format of API responses). ``utcnow_naive``
returns the current time in that canonical form so every call site
computes it the same way.

A previous version of this helper was duplicated in 11 files
(_utc_naive in 9, _utcnow_naive in 2) as a private module-level
function. This module is the single source of truth.
"""

from __future__ import annotations

from datetime import datetime, timezone


def utcnow_naive() -> datetime:
    """Current time as a naive UTC datetime.

    The codebase's convention is to store and compare naive UTC
    datetimes everywhere (no tzinfo) so SQLite + Postgres agree and
    the wire format matches what every JSON consumer expects.
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)
