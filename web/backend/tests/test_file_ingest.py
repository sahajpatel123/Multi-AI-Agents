"""Tests for upload text/image extraction and hardening (arena.core.file_ingest)."""

import io
import os
import uuid

import pytest


def _png_bytes(width: int, height: int) -> bytes:
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (width, height), (123, 200, 50)).save(buf, format="PNG")
    return buf.getvalue()


def test_process_upload_rejects_path_traversal():
    """Path traversal attempts must be rejected with clear ValueError."""
    from arena.core.file_ingest import process_upload

    # Attempt to escape the uploads directory via path traversal
    with pytest.raises(ValueError, match="path traversal|Invalid file path"):
        process_upload(
            filename="test.txt",
            content_type="text/plain",
            data=b"hello world",
            dest_path="../../../etc/passwd",
        )


def test_process_upload_rejects_outside_upload_root():
    """Absolute paths outside UPLOAD_DIR must be rejected (no /etc writes)."""
    from arena.core.file_ingest import process_upload

    with pytest.raises(ValueError, match="Invalid file path|uploads directory"):
        process_upload(
            filename="test.txt",
            content_type="text/plain",
            data=b"hello world",
            dest_path="/etc/passwd",
        )


def test_process_upload_accepts_path_under_upload_dir(tmp_path, monkeypatch):
    """Agent route writes absolute dest under UPLOAD_DIR — must succeed.

    A previous guard rejected every absolute path, which 400'd all real
    agent uploads that use /tmp/arena_uploads/<id>_<name>.
    """
    from arena.core import file_ingest, upload_store

    sandbox = tmp_path / "arena_uploads"
    sandbox.mkdir()
    monkeypatch.setattr(upload_store, "UPLOAD_DIR", str(sandbox))
    monkeypatch.setattr(file_ingest, "UPLOAD_DIR", str(sandbox))
    # conftest stubs python-magic as application/octet-stream; override
    # for this write path so we exercise the dest-path guard, not MIME.
    monkeypatch.setattr(
        file_ingest.magic, "from_buffer", lambda *_a, **_k: "text/plain"
    )

    dest = sandbox / f"{uuid.uuid4().hex[:8]}_hello.txt"
    record = file_ingest.process_upload(
        filename="hello.txt",
        content_type="text/plain",
        data=b"hello world",
        dest_path=str(dest),
    )
    assert record["type"] == "doc"
    assert "hello world" in (record.get("content") or "")
    assert os.path.isfile(dest)
    assert dest.read_bytes() == b"hello world"


def test_process_upload_rejects_escape_via_dotdot_under_root(tmp_path, monkeypatch):
    """Even if dest looks rooted under UPLOAD_DIR, `..` must not escape."""
    from arena.core import file_ingest, upload_store

    sandbox = tmp_path / "arena_uploads"
    sandbox.mkdir()
    monkeypatch.setattr(upload_store, "UPLOAD_DIR", str(sandbox))
    monkeypatch.setattr(file_ingest, "UPLOAD_DIR", str(sandbox))

    with pytest.raises(ValueError, match="path traversal|uploads directory|Invalid"):
        file_ingest.process_upload(
            filename="evil.txt",
            content_type="text/plain",
            data=b"nope",
            dest_path=str(sandbox / ".." / "outside.txt"),
        )


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
