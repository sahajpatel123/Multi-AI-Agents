"""CSRF helper: length-safe constant-time validation."""

from arena.core.csrf import generate_csrf_token, validate_csrf_token


def test_round_trip():
    token = generate_csrf_token("sess-1", "secret")
    assert validate_csrf_token(token, "secret") is True


def test_wrong_secret_rejected():
    token = generate_csrf_token("sess-1", "secret")
    assert validate_csrf_token(token, "other") is False


def test_tampered_session_rejected():
    token = generate_csrf_token("sess-1", "secret")
    # Swap session id prefix but keep signature
    _, sig = token.split(".", 1)
    assert validate_csrf_token(f"sess-2.{sig}", "secret") is False


def test_short_signature_rejected_without_raise():
    assert validate_csrf_token("sess.short", "secret") is False
    assert validate_csrf_token("nosplit", "secret") is False
    assert validate_csrf_token("", "secret") is False
    assert validate_csrf_token(None, "secret") is False  # type: ignore[arg-type]
