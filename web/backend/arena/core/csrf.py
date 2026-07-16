"""CSRF token generation and validation."""

from __future__ import annotations

from arena.core.hmac_verify import hmac_sha256_hex, hmac_sha256_hex_equal


def generate_csrf_token(session_id: str, secret: str) -> str:
    """Generate a CSRF token bound to a session ID."""
    signature = hmac_sha256_hex(secret, session_id)
    return f"{session_id}.{signature}"


def validate_csrf_token(token: str, secret: str) -> bool:
    """Validate a CSRF token. Returns True if valid, False otherwise.

    Length-mismatched / empty signatures fail closed without raising
    (``hmac.compare_digest`` length errors must never become a 500).
    """
    try:
        if not token or not isinstance(token, str) or not secret:
            return False
        parts = token.split(".", 1)
        if len(parts) != 2:
            return False
        session_id, signature = parts
        if not session_id or not signature:
            return False
        return hmac_sha256_hex_equal(secret, session_id, signature)
    except Exception:
        return False