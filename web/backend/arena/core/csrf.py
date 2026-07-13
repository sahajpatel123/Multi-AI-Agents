"""CSRF token generation and validation."""

import hmac
import hashlib
import secrets


def generate_csrf_token(session_id: str, secret: str) -> str:
    """Generate a CSRF token bound to a session ID."""
    signature = hmac.new(
        secret.encode(),
        session_id.encode(),
        hashlib.sha256,
    ).hexdigest()
    return f"{session_id}.{signature}"


def validate_csrf_token(token: str, secret: str) -> bool:
    """Validate a CSRF token. Returns True if valid, False otherwise."""
    try:
        parts = token.split(".", 1)
        if len(parts) != 2:
            return False
        session_id, signature = parts
        expected = hmac.new(
            secret.encode(),
            session_id.encode(),
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(signature, expected)
    except Exception:
        return False