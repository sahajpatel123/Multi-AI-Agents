"""Fernet helpers for MCP OAuth / manual tokens (ENCRYPTION_KEY)."""

from __future__ import annotations

import logging
import os
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)

_fernet: Optional[Fernet] = None


def get_fernet() -> Optional[Fernet]:
    """Return Fernet instance if ENCRYPTION_KEY is set and valid; else None."""
    global _fernet
    key = os.environ.get("ENCRYPTION_KEY", "").strip()
    if not key:
        return None
    if _fernet is not None:
        return _fernet
    try:
        _fernet = Fernet(key.encode())
    except Exception as e:
        logger.warning("[CRYPTO] Invalid ENCRYPTION_KEY: %s", e)
        return None
    return _fernet


def encrypt_token(plain: str) -> str:
    f = get_fernet()
    if not f:
        raise RuntimeError("encryption_unavailable")
    return f.encrypt(plain.encode()).decode()


def decrypt_token(blob: str) -> str:
    f = get_fernet()
    if not f:
        raise RuntimeError("encryption_unavailable")
    return f.decrypt(blob.encode()).decode()


def try_decrypt_token(blob: str) -> Optional[str]:
    try:
        return decrypt_token(blob)
    except (InvalidToken, RuntimeError, Exception):
        return None
