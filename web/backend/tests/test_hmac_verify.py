"""HMAC helper: length-safe constant-time compare."""

from arena.core.hmac_verify import hmac_sha256_hex, hmac_sha256_hex_equal


def test_round_trip_equal():
    secret = "s3cret"
    msg = b'{"event":"x"}'
    dig = hmac_sha256_hex(secret, msg)
    assert hmac_sha256_hex_equal(secret, msg, dig) is True


def test_wrong_secret_rejected():
    dig = hmac_sha256_hex("good", b"body")
    assert hmac_sha256_hex_equal("bad", b"body", dig) is False


def test_short_signature_rejected_without_raise():
    dig = hmac_sha256_hex("s", b"body")
    assert hmac_sha256_hex_equal("s", b"body", "short") is False
    assert hmac_sha256_hex_equal("s", b"body", "") is False
    assert hmac_sha256_hex_equal("s", b"body", None) is False
    # Sanity: full digest still works.
    assert hmac_sha256_hex_equal("s", b"body", dig) is True


def test_tampered_body_rejected():
    dig = hmac_sha256_hex("s", b"original")
    assert hmac_sha256_hex_equal("s", b"tampered", dig) is False
