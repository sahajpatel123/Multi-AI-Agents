"""Constant-time HMAC helpers that never 500 on malformed signatures.

``hmac.compare_digest`` raises ``ValueError`` when the two digests differ
in length (bytes path) or can otherwise surface a 500 if a caller passes
a short/empty client-supplied header. Every payment signature gate must
reject those shapes as auth failures (False / 400), not as server errors.
"""

from __future__ import annotations

import hashlib
import hmac
from typing import Union


def hmac_sha256_hex(secret: Union[str, bytes], message: Union[str, bytes]) -> str:
    """Return the hex digest of HMAC-SHA256(secret, message)."""
    if isinstance(secret, str):
        secret = secret.encode("utf-8")
    if isinstance(message, str):
        message = message.encode("utf-8")
    return hmac.new(secret, message, hashlib.sha256).hexdigest()


def hmac_sha256_hex_equal(
    secret: Union[str, bytes],
    message: Union[str, bytes],
    provided: str | None,
) -> bool:
    """True iff ``provided`` is the HMAC-SHA256 hex of (secret, message).

    Empty, None, or wrong-length signatures return False without raising.
    """
    if not isinstance(provided, str) or not provided:
        return False
    expected = hmac_sha256_hex(secret, message)
    if len(provided) != len(expected):
        return False
    return hmac.compare_digest(expected, provided)
