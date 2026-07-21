"""Razorpay webhook replay protection (idempotency ledger).

Valid HMAC-signed payloads can be replayed. Without a claim ledger, a
repeated ``subscription.charged`` / ``payment.captured`` can re-apply
tier changes. We claim a deterministic ``event_key`` *before* side
effects; duplicates short-circuit with HTTP 200 so Razorpay stops
retrying, and failed handlers release the claim so genuine retries work.
"""

from __future__ import annotations

import hashlib
import logging
from datetime import timedelta
from typing import Any, Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from arena.core.datetime_utils import utcnow_naive
from arena.db_models import ProcessedWebhookEvent

logger = logging.getLogger(__name__)

# Keep claims long enough to cover Razorpay's retry window, not forever.
EVENT_TTL = timedelta(days=7)
_MAX_KEY_LEN = 128


def build_webhook_event_key(
    payload: dict[str, Any],
    *,
    event_id_header: Optional[str] = None,
) -> str:
    """Derive a stable idempotency key for a verified webhook payload.

    Prefer Razorpay's ``X-Razorpay-Event-Id`` when present; otherwise
    digest ``event|entity_id|created_at`` so redelivered bodies collide.
    """
    header = (event_id_header or "").strip()
    if header:
        key = f"hdr:{header}"
        return key[:_MAX_KEY_LEN]

    event = str(payload.get("event") or "").strip()
    created = payload.get("created_at")
    entity_id = _extract_entity_id(payload)
    digest = hashlib.sha256(
        f"{event}|{entity_id or ''}|{created if created is not None else ''}".encode("utf-8")
    ).hexdigest()
    return f"dig:{digest}"[:_MAX_KEY_LEN]


def _extract_entity_id(payload: dict[str, Any]) -> Optional[str]:
    try:
        body = payload.get("payload") or {}
        if not isinstance(body, dict):
            return None
        for kind in ("subscription", "payment", "invoice", "order"):
            block = body.get(kind)
            if not isinstance(block, dict):
                continue
            ent = block.get("entity")
            if isinstance(ent, dict) and ent.get("id"):
                return str(ent["id"])
    except Exception:
        logger.debug("webhook entity id extract failed", exc_info=True)
    return None


def claim_webhook_event(
    db: Session,
    event_key: str,
    *,
    event_name: Optional[str] = None,
) -> bool:
    """Try to claim ``event_key``.

    Returns True if this worker owns the claim (first sighting).
    Returns False if the key was already processed (replay).
    """
    key = (event_key or "").strip()
    if not key:
        # Refuse empty keys — better to process than poison the unique index.
        logger.warning("webhook claim skipped: empty event_key")
        return True

    now = utcnow_naive()
    row = ProcessedWebhookEvent(
        event_key=key[:_MAX_KEY_LEN],
        event_name=(event_name or None),
        processed_at=now,
        expires_at=now + EVENT_TTL,
    )
    try:
        db.add(row)
        db.commit()
        return True
    except IntegrityError:
        db.rollback()
        logger.info("webhook replay suppressed event_key=%s…", key[:24])
        return False


def release_webhook_event(db: Session, event_key: str) -> None:
    """Drop a claim so Razorpay can retry after a handler failure."""
    key = (event_key or "").strip()
    if not key:
        return
    try:
        (
            db.query(ProcessedWebhookEvent)
            .filter(ProcessedWebhookEvent.event_key == key[:_MAX_KEY_LEN])
            .delete(synchronize_session=False)
        )
        db.commit()
    except Exception:
        logger.warning("failed to release webhook claim %s…", key[:24], exc_info=True)
        try:
            db.rollback()
        except Exception:
            logger.warning("rollback after webhook claim release failed", exc_info=True)


def purge_expired_webhook_events(db: Session, *, batch_limit: int = 1000) -> int:
    """Delete expired idempotency rows. Returns number deleted."""
    now = utcnow_naive()
    try:
        q = (
            db.query(ProcessedWebhookEvent)
            .filter(ProcessedWebhookEvent.expires_at <= now)
            .limit(batch_limit)
        )
        # SQLAlchemy 1.4/2.0: delete via ids for dialect portability.
        ids = [row.id for row in q.all()]
        if not ids:
            return 0
        deleted = (
            db.query(ProcessedWebhookEvent)
            .filter(ProcessedWebhookEvent.id.in_(ids))
            .delete(synchronize_session=False)
        )
        db.commit()
        return int(deleted or 0)
    except Exception:
        logger.warning("purge_expired_webhook_events failed", exc_info=True)
        try:
            db.rollback()
        except Exception:
            pass
        return 0
