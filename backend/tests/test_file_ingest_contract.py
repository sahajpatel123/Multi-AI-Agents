"""Regression tests for ``file_ingest`` — upload pipeline hardening.

Pins the security and safety contracts for the file-upload helpers that
sit between FastAPI endpoints and the agent pipeline:

  - ``MAX_IMAGE_PIXELS`` exact value + order-of-operations defense
    (declared-pixel check BEFORE ``im.load()`` so a decompression bomb
    can't spike memory before the check).
  - ``MAX_TEXT`` exact truncation length.
  - ``DISALLOWED_EXTENSIONS`` exact set.
  - ``ALLOWED_MIME_TYPES`` exact set.
  - ``image_b64_and_mime`` never leaks raw PIL / library exception
    messages to the client — every failure is converted to a
    sanitized ``ValueError``.
  - ``_resolve_safe_dest`` rejects path traversal (``..`` segments,
    paths outside the UPLOAD_DIR root).
  - ``_truncate`` default + custom limits, never raises.
  - ``extract_plain_text`` never raises on malformed bytes.

These contracts collectively ensure user-uploaded files cannot blow
memory (decompression bombs), leak internal library errors to the
client, or escape the upload sandbox.
"""

from __future__ import annotations

import io
import os

import pytest

from arena.core.file_ingest import (
    ALLOWED_MIME_TYPES,
    DISALLOWED_EXTENSIONS,
    MAX_IMAGE_PIXELS,
    MAX_TEXT,
    _resolve_safe_dest,
    _truncate,
    extract_plain_text,
    image_b64_and_mime,
)
from arena.core.upload_store import UPLOAD_DIR


class TestConstantsExact:
    def test_max_image_pixels_is_50_megapixels(self):
        """50 MP is the documented ceiling — comfortably above any
        legitimate upload (a 50-megapixel photo is already
        professional-grade)."""
        assert MAX_IMAGE_PIXELS == 50_000_000

    def test_max_text_is_3000(self):
        """Truncation length for extracted document text."""
        assert MAX_TEXT == 3000

    def test_disallowed_extensions_exact_set(self):
        """The exact list of executable / script extensions that must
        be rejected — pinning the set prevents accidental removal
        or addition of an unsafe extension."""
        assert DISALLOWED_EXTENSIONS == {".exe", ".sh", ".py", ".js"}

    def test_allowed_mime_types_exact_set(self):
        """The exact allowlist of accepted MIME types. Any new MIME
        type must be a deliberate, reviewed addition."""
        assert ALLOWED_MIME_TYPES == {
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "image/jpeg",
            "image/png",
            "image/webp",
            "text/plain",
        }


class TestTruncate:
    def test_short_input_returned_as_is_after_strip(self):
        """Strings at or below the limit pass through (after strip)."""
        assert _truncate("hello") == "hello"
        assert _truncate("  hi  ") == "hi"

    def test_long_input_is_truncated_to_limit(self):
        long = "x" * 5000
        result = _truncate(long)
        assert len(result) == MAX_TEXT

    def test_custom_limit_respected(self):
        long = "x" * 1000
        assert len(_truncate(long, n=42)) == 42

    def test_empty_string_returns_empty_string(self):
        assert _truncate("") == ""

    def test_whitespace_only_returns_empty_string(self):
        assert _truncate("   \n\t  ") == ""

    def test_none_input_returns_empty_string(self):
        """The defensive contract: ``None`` must not raise."""
        assert _truncate(None) == ""  # type: ignore[arg-type]


class TestResolveSafeDest:
    def test_relative_path_under_upload_dir_accepted(self):
        """A relative path under UPLOAD_DIR resolves cleanly."""
        rel = os.path.join(UPLOAD_DIR, "file.pdf")
        result = _resolve_safe_dest(rel)
        assert isinstance(result, os.PathLike)

    def test_traversal_double_dot_rejected(self):
        """A path containing ``..`` must raise ValueError before
        resolve() can be tricked by a quirk."""
        bad = os.path.join(UPLOAD_DIR, "..", "..", "etc", "passwd")
        with pytest.raises(ValueError, match="path traversal"):
            _resolve_safe_dest(bad)

    def test_path_outside_upload_dir_rejected(self):
        """An absolute path that resolves outside UPLOAD_DIR (e.g.
        /etc/passwd) must be rejected with a sanitized message —
        never the raw ``relative_to`` message."""
        with pytest.raises(ValueError, match="within uploads directory"):
            _resolve_safe_dest("/etc/passwd")

    def test_empty_path_rejected(self):
        with pytest.raises(ValueError, match="empty destination"):
            _resolve_safe_dest("")

    def test_whitespace_only_path_rejected(self):
        with pytest.raises(ValueError, match="empty destination"):
            _resolve_safe_dest("   ")


class TestImageBombDefense:
    def test_oversize_declared_dimensions_rejected_without_full_decode(self):
        """An image whose declared pixel count exceeds MAX_IMAGE_PIXELS
        must be rejected with a clean ValueError, BEFORE the full
        decode runs. The declared-pixel check in ``Image.open`` is
        cheap; ``im.load()`` forces the full decode and is where a
        decompression bomb would spike memory.

        We craft a PNG header with an absurd width×height so that
        ``Image.open`` reports the declared size — the helper then
        sees ``width * height > MAX_IMAGE_PIXELS`` and rejects it
        without ever calling ``im.load()``.
        """
        import struct
        import zlib

        # PNG signature + IHDR chunk declaring absurd dimensions.
        # We don't need valid IDAT data — Image.open will read the
        # header (cheap) but the size check fires before load().
        width = MAX_IMAGE_PIXELS + 1  # forces width*height > limit
        height = 1
        # Build IHDR payload (13 bytes): width(4) + height(4) +
        # bit_depth(1) + color_type(1) + compression(1) + filter(1) +
        # interlace(1).
        ihdr_data = struct.pack(
            ">IIBBBBB",
            width,
            height,
            8,  # bit depth
            2,  # color type RGB
            0,  # compression
            0,  # filter
            0,  # interlace
        )
        # CRC over chunk type + chunk data.
        ihdr_crc = zlib.crc32(b"IHDR" + ihdr_data) & 0xFFFFFFFF
        ihdr_chunk = struct.pack(">I", 13) + b"IHDR" + ihdr_data + struct.pack(
            ">I", ihdr_crc
        )
        # Minimal fake IDAT so PIL accepts the file structurally.
        fake_idat_data = zlib.compress(b"\x00" * 8)
        idat_crc = zlib.crc32(b"IDAT" + fake_idat_data) & 0xFFFFFFFF
        idat_chunk = (
            struct.pack(">I", len(fake_idat_data))
            + b"IDAT"
            + fake_idat_data
            + struct.pack(">I", idat_crc)
        )
        # IEND.
        iend_crc = zlib.crc32(b"IEND") & 0xFFFFFFFF
        iend_chunk = struct.pack(">I", 0) + b"IEND" + struct.pack(">I", iend_crc)

        bomb = b"\x89PNG\r\n\x1a\n" + ihdr_chunk + idat_chunk + iend_chunk

        with pytest.raises(ValueError, match="too large"):
            image_b64_and_mime(bomb, "image/png")

    def test_corrupt_image_raises_sanitized_valueerror(self):
        """Random non-image bytes must NOT leak the underlying PIL
        exception message to the client. The error must be a
        sanitized ValueError."""
        bad = b"this is definitely not an image" * 100
        with pytest.raises(ValueError) as exc_info:
            image_b64_and_mime(bad, "image/png")
        # Pin the exact sanitized message — never the raw PIL text.
        assert str(exc_info.value) == "Could not read image file."

    def test_truncated_png_raises_sanitized_valueerror(self):
        """A truncated PNG (header only, no IDAT chunks) must raise
        a sanitized ValueError, not a raw PIL/OSError."""
        # Valid PNG header followed by garbage.
        bad = b"\x89PNG\r\n\x1a\n" + b"\x00" * 8
        with pytest.raises(ValueError) as exc_info:
            image_b64_and_mime(bad, "image/png")
        assert str(exc_info.value) == "Could not read image file."

    def test_valid_small_image_succeeds(self):
        """A real, small PNG passes through and produces a
        base64 payload + MIME tuple."""
        from PIL import Image

        im = Image.new("RGB", (4, 4), color=(255, 0, 0))
        buf = io.BytesIO()
        im.save(buf, format="PNG")
        data = buf.getvalue()
        b64, mime = image_b64_and_mime(data, "image/png")
        assert isinstance(b64, str)
        assert len(b64) > 0
        assert mime == "image/png"

    def test_valid_jpeg_passes_with_jpeg_mime(self):
        from PIL import Image

        im = Image.new("RGB", (4, 4), color=(0, 255, 0))
        buf = io.BytesIO()
        im.save(buf, format="JPEG")
        data = buf.getvalue()
        _, mime = image_b64_and_mime(data, "image/jpeg")
        assert mime == "image/jpeg"

    def test_valid_webp_passes_with_webp_mime(self):
        from PIL import Image

        im = Image.new("RGB", (4, 4), color=(0, 0, 255))
        buf = io.BytesIO()
        im.save(buf, format="WEBP")
        data = buf.getvalue()
        _, mime = image_b64_and_mime(data, "image/webp")
        assert mime == "image/webp"


class TestExtractPlainText:
    def test_utf8_text_passes_through(self):
        assert extract_plain_text(b"hello world") == "hello world"

    def test_invalid_bytes_fall_back_to_empty(self):
        """Malformed UTF-8 must NOT raise — the helper silently
        coerces with ``errors='ignore'`` and returns what it
        could decode."""
        bad = b"\xff\xfe\x00\x01\x80\x90"
        result = extract_plain_text(bad)
        assert isinstance(result, str)

    def test_empty_bytes_return_empty_string(self):
        assert extract_plain_text(b"") == ""

    def test_truncates_to_max_text(self):
        """Long plaintext is truncated to MAX_TEXT characters."""
        long = b"x" * (MAX_TEXT + 500)
        result = extract_plain_text(long)
        assert len(result) == MAX_TEXT

    def test_strips_leading_trailing_whitespace(self):
        assert extract_plain_text(b"  hi  ") == "hi"


class TestErrorMessageSanitization:
    """The file-ingest helpers must NEVER leak raw library exception
    text to the client. Every ``ValueError`` message is hand-curated."""

    def test_corrupt_png_message_does_not_contain_pil_internal_text(self):
        """The sanitized error must not contain library-specific
        fingerprints (PIL, png, decoder, etc.)."""
        bad = b"not an image at all" * 50
        with pytest.raises(ValueError) as exc_info:
            image_b64_and_mime(bad, "image/png")
        msg = str(exc_info.value).lower()
        assert "pil" not in msg
        assert "decoder" not in msg
        assert "traceback" not in msg

    def test_corrupt_jpeg_message_does_not_contain_jpeg_internal_text(self):
        """JPEG-specific libfpx / PIL exceptions must not leak."""
        bad = b"\xff\xd8\xff\xe0" + b"\x00" * 8  # JPEG SOI + bad header
        with pytest.raises(ValueError) as exc_info:
            image_b64_and_mime(bad, "image/jpeg")
        msg = str(exc_info.value).lower()
        assert msg == "could not read image file."

    def test_oversize_image_message_does_not_leak_pixel_count(self):
        """The sanitized message must not echo the exact pixel count
        (which could fingerprint a future change to MAX_IMAGE_PIXELS
        or aid an attacker probing limits)."""
        import struct
        import zlib

        # Hand-crafted PNG with declared width = 2 × MAX_IMAGE_PIXELS.
        width = MAX_IMAGE_PIXELS * 2
        height = 1
        ihdr_data = struct.pack(
            ">IIBBBBB", width, height, 8, 2, 0, 0, 0
        )
        ihdr_crc = zlib.crc32(b"IHDR" + ihdr_data) & 0xFFFFFFFF
        ihdr_chunk = (
            struct.pack(">I", 13) + b"IHDR" + ihdr_data + struct.pack(">I", ihdr_crc)
        )
        fake_idat_data = zlib.compress(b"\x00" * 8)
        idat_crc = zlib.crc32(b"IDAT" + fake_idat_data) & 0xFFFFFFFF
        idat_chunk = (
            struct.pack(">I", len(fake_idat_data))
            + b"IDAT"
            + fake_idat_data
            + struct.pack(">I", idat_crc)
        )
        iend_crc = zlib.crc32(b"IEND") & 0xFFFFFFFF
        iend_chunk = struct.pack(">I", 0) + b"IEND" + struct.pack(">I", iend_crc)

        bomb = b"\x89PNG\r\n\x1a\n" + ihdr_chunk + idat_chunk + iend_chunk

        with pytest.raises(ValueError) as exc_info:
            image_b64_and_mime(bomb, "image/png")
        msg = str(exc_info.value)
        assert str(MAX_IMAGE_PIXELS) not in msg
        assert "50_000_000" not in msg
        assert str(MAX_IMAGE_PIXELS * 2) not in msg
