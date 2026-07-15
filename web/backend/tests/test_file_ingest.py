"""Tests for upload text/image extraction and hardening (arena.core.file_ingest)."""

import io

import pytest


def _png_bytes(width: int, height: int) -> bytes:
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (width, height), (123, 200, 50)).save(buf, format="PNG")
    return buf.getvalue()


def test_image_b64_and_mime_accepts_small_image():
    from arena.core.file_ingest import image_b64_and_mime

    data = _png_bytes(4, 4)
    b64, mime = image_b64_and_mime(data, "image/png")
    assert mime == "image/png"
    assert b64  # non-empty base64 payload


def test_image_b64_and_mime_rejects_oversized_image(monkeypatch):
    """A declared pixel count above the ceiling must be rejected as a clean
    ValueError (HTTP 400) — the decompression-bomb guard — instead of being
    decoded into memory or crashing with a 500."""
    from arena.core import file_ingest

    # Lower the ceiling so a tiny valid image trips the guard deterministically.
    monkeypatch.setattr(file_ingest, "MAX_IMAGE_PIXELS", 4)
    data = _png_bytes(10, 10)  # 100 px > 4
    with pytest.raises(ValueError):
        file_ingest.image_b64_and_mime(data, "image/png")


def test_image_b64_and_mime_rejects_non_image_bytes():
    """Garbage bytes must surface as a clean ValueError, not an unhandled 500."""
    from arena.core.file_ingest import image_b64_and_mime

    with pytest.raises(ValueError):
        image_b64_and_mime(b"this is definitely not an image", "image/png")
