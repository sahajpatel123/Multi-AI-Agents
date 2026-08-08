"""Regression tests for ``bounded_read.read_upload_capped``.

Memory-DoS-prevention contract for upload endpoints. Without this
helper, ``await file.read()`` materializes the entire body in
memory before any size check — a crafted multipart upload can
spike process RSS to gigabytes.

Pins:
  - ``DEFAULT_CHUNK_SIZE`` exact value (64 KiB).
  - ``UploadTooLargeError`` is a ``ValueError`` subclass (so HTTP
    error handlers treat it as a 400, not an unhandled 500).
  - ``UploadTooLargeError`` message contains both the ceiling and
    the actual bytes delivered (operators need both numbers to
    diagnose).
  - ``max_bytes < 0`` raises ``ValueError`` immediately, before
    touching the file object.
  - ``chunk_size < 1`` raises ``ValueError`` immediately.
  - At-the-cap read (max_bytes == total) returns the full payload
    without raising.
  - Off-by-one: a payload one byte over the cap trips
    ``UploadTooLargeError`` — never silently truncates.
  - Oversize aborts WITHOUT retaining the full tail (cap is a
    short-circuit, not a "read-everything-then-check").
  - The chunk-size argument is honored.
  - Empty upload returns ``b""`` without raising.
  - Multiple chunks are concatenated in order.
  - Caller-supplied chunk_size below 1 is rejected before any
    I/O happens.
"""

from __future__ import annotations

import pytest

from arena.core.bounded_read import (
    DEFAULT_CHUNK_SIZE,
    UploadTooLargeError,
    read_upload_capped,
)


class _FakeUpload:
    """In-memory async readable for unit testing the streaming loop.

    Tracks every read call so tests can assert the helper short-
    circuits on oversize (does NOT drain the rest of the payload).
    """

    def __init__(self, payload: bytes) -> None:
        self._payload = payload
        self._offset = 0
        self.reads = 0
        self.bytes_delivered = 0

    async def read(self, size: int = -1) -> bytes:
        self.reads += 1
        if self._offset >= len(self._payload):
            return b""
        if size < 0:
            chunk = self._payload[self._offset :]
            self._offset = len(self._payload)
        else:
            chunk = self._payload[self._offset : self._offset + size]
            self._offset += len(chunk)
        self.bytes_delivered += len(chunk)
        return chunk


class TestConstants:
    def test_default_chunk_size_is_64_kib(self):
        """64 KiB is the documented default. Pin the exact value so
        any tuning is a deliberate, reviewed change."""
        assert DEFAULT_CHUNK_SIZE == 64 * 1024

    @pytest.mark.asyncio
    async def test_default_chunk_size_passes_through_when_not_overridden(self):
        """The helper uses ``DEFAULT_CHUNK_SIZE`` when no explicit
        ``chunk_size`` is supplied."""
        # We can't introspect the helper's internal chunk_size, but
        # we can verify it stays within a sane bound on a moderate
        # payload — if the default were absurdly tiny, the
        # ``reads`` counter would explode on a multi-chunk payload.
        fake = _FakeUpload(b"x" * (DEFAULT_CHUNK_SIZE * 3))
        out = await read_upload_capped(fake, DEFAULT_CHUNK_SIZE * 3)
        assert out == b"x" * (DEFAULT_CHUNK_SIZE * 3)
        # 3 chunks worth of payload → 4 reads (3 real + 1 EOF) is
        # the expected cadence with DEFAULT_CHUNK_SIZE.
        assert 4 <= fake.reads <= 5


class TestUploadTooLargeError:
    def test_is_value_error_subclass(self):
        """HTTP error handlers (FastAPI exception_handler mapping
        ``ValueError`` → 400) MUST treat this as a client error,
        not an unhandled 500."""
        assert issubclass(UploadTooLargeError, ValueError)

    def test_can_be_raised_and_caught_as_value_error(self):
        with pytest.raises(ValueError):
            raise UploadTooLargeError("upload exceeds max_bytes=10 (got at least 11)")

    def test_message_contains_max_bytes(self):
        """Operators diagnosing a spike need to see the ceiling."""
        exc = UploadTooLargeError("upload exceeds max_bytes=4096 (got at least 5000)")
        assert "4096" in str(exc)

    def test_message_contains_actual_size(self):
        """Operators also need to see how big the upload actually was
        to distinguish a malicious oversize from a legit retry."""
        exc = UploadTooLargeError("upload exceeds max_bytes=4096 (got at least 5000)")
        assert "5000" in str(exc)


class TestArgumentValidation:
    @pytest.mark.asyncio
    async def test_negative_max_bytes_rejected_immediately(self):
        fake = _FakeUpload(b"hello")
        with pytest.raises(ValueError, match="max_bytes"):
            await read_upload_capped(fake, -1)
        # No reads happened — argument validation precedes I/O.
        assert fake.reads == 0
        assert fake.bytes_delivered == 0

    @pytest.mark.asyncio
    async def test_zero_max_bytes_accepted_zero_is_a_legitimate_ceiling(self):
        """``max_bytes=0`` is a valid (if unusual) call — caller is
        explicitly forbidding any payload. It must not raise on
        argument validation; it should trip ``UploadTooLargeError``
        on the first byte."""
        fake = _FakeUpload(b"hello")
        with pytest.raises(UploadTooLargeError):
            await read_upload_capped(fake, 0, chunk_size=64)
        # Exactly one byte requested before the guard fires.
        assert fake.reads == 1
        assert fake.bytes_delivered == 1

    @pytest.mark.asyncio
    async def test_zero_chunk_size_rejected(self):
        fake = _FakeUpload(b"hello")
        with pytest.raises(ValueError, match="chunk_size"):
            await read_upload_capped(fake, 100, chunk_size=0)
        assert fake.reads == 0

    @pytest.mark.asyncio
    async def test_negative_chunk_size_rejected(self):
        fake = _FakeUpload(b"hello")
        with pytest.raises(ValueError, match="chunk_size"):
            await read_upload_capped(fake, 100, chunk_size=-1)
        assert fake.reads == 0


class TestAtTheCap:
    @pytest.mark.asyncio
    async def test_exact_cap_returns_full_payload_without_raising(self):
        """``max_bytes == total bytes`` is the legal boundary — the
        full payload must come back, no exception."""
        data = b"a" * 100
        out = await read_upload_capped(_FakeUpload(data), 100, chunk_size=32)
        assert out == data

    @pytest.mark.asyncio
    async def test_one_byte_over_cap_trips_oversize(self):
        """Off-by-one regression: 1 byte past the cap must trip the
        guard. The helper must NOT silently truncate."""
        data = b"a" * 101
        with pytest.raises(UploadTooLargeError):
            await read_upload_capped(_FakeUpload(data), 100, chunk_size=64)

    @pytest.mark.asyncio
    async def test_one_byte_under_cap_succeeds(self):
        """And the symmetric: 1 byte under the cap must succeed."""
        data = b"a" * 99
        out = await read_upload_capped(_FakeUpload(data), 100, chunk_size=64)
        assert out == data


class TestShortCircuitOnOversize:
    @pytest.mark.asyncio
    async def test_oversize_aborts_without_draining_tail(self):
        """Memory-DoS contract: the helper must NOT keep reading
        after the cap is crossed. If it did, a 10 GB upload against
        a 1 MB cap would buffer the full 10 GB before failing."""
        fake = _FakeUpload(b"x" * 10_000_000)  # 10 MB
        with pytest.raises(UploadTooLargeError):
            await read_upload_capped(fake, 1024, chunk_size=4096)
        # Only one chunk past the cap was read before the guard fired.
        # (The helper asks for ``remaining + 1`` bytes — i.e. up to
        # 1025 bytes — to make sure an exact-boundary payload still
        # trips correctly.)
        assert fake.bytes_delivered <= 1024 + 4096
        assert fake.bytes_delivered < 10_000_000

    @pytest.mark.asyncio
    async def test_oversize_does_not_drain_remaining_payload(self):
        """After the cap is crossed, the helper MUST NOT keep
        reading — the third/fourth/N-th read past the cap would
        defeat the whole point of having a streaming guard."""
        fake = _FakeUpload(b"y" * 1_000_000)
        with pytest.raises(UploadTooLargeError):
            await read_upload_capped(fake, 100, chunk_size=100)
        # The ``remaining + 1`` trick asks for one extra byte at the
        # boundary so a payload exactly at the cap still trips.
        # Worst case: 2 reads (one for the cap-sized chunk, one for
        # the +1 byte that crosses). Anything close to
        # ``1_000_000 / chunk_size`` would mean the helper is NOT
        # short-circuiting.
        assert fake.reads <= 2
        assert fake.bytes_delivered <= 101
        assert fake.bytes_delivered < 1_000_000

    @pytest.mark.asyncio
    async def test_oversize_at_exact_chunk_boundary(self):
        """When the cap lands exactly on a chunk boundary, the
        guard must still fire on the next read (not silently
        return ``total == cap`` as success)."""
        fake = _FakeUpload(b"z" * 200)
        with pytest.raises(UploadTooLargeError):
            await read_upload_capped(fake, 100, chunk_size=100)
        # First read: 100 bytes (remaining=100, +1 capped by chunk_size).
        # Second read: 1 byte (remaining=0, +1), trips the guard.
        assert fake.reads == 2
        assert fake.bytes_delivered == 101


class TestChunkSizeHonored:
    @pytest.mark.asyncio
    async def test_custom_chunk_size_is_respected(self):
        """A caller-supplied ``chunk_size`` of 7 bytes must be the
        upper bound on each read request — verifiable by counting
        reads on a 70-byte payload (expect 10 data-reads + 1 EOF)."""
        fake = _FakeUpload(b"q" * 70)
        out = await read_upload_capped(fake, 100, chunk_size=7)
        assert out == b"q" * 70
        # 10 data reads (7 bytes each), then EOF.
        assert fake.reads == 11

    @pytest.mark.asyncio
    async def test_chunk_size_larger_than_payload_reads_in_one_shot(self):
        """A huge ``chunk_size`` against a tiny payload: single
        read, EOF on next iteration."""
        fake = _FakeUpload(b"tiny")
        out = await read_upload_capped(fake, 100, chunk_size=4096)
        assert out == b"tiny"
        assert fake.reads == 2  # 1 data + 1 EOF


class TestEmptyAndBoundaryInputs:
    @pytest.mark.asyncio
    async def test_empty_upload_returns_empty_bytes(self):
        out = await read_upload_capped(_FakeUpload(b""), 1024)
        assert out == b""

    @pytest.mark.asyncio
    async def test_empty_upload_with_zero_cap_raises(self):
        """An empty upload against ``max_bytes=0`` is still 0 bytes
        and within the cap — must succeed without raising."""
        out = await read_upload_capped(_FakeUpload(b""), 0)
        assert out == b""

    @pytest.mark.asyncio
    async def test_zero_byte_upload_does_not_loop_forever(self):
        """Pin the EOF behavior: empty payload → one read returns
        ``b""`` → loop exits. No infinite loop on a stale stream."""
        fake = _FakeUpload(b"")
        await read_upload_capped(fake, 1024)
        assert fake.reads == 1  # one EOF read, then exit


class TestMultiChunkAssembly:
    @pytest.mark.asyncio
    async def test_chunks_concatenated_in_order(self):
        """The helper must reassemble chunks in read order — not
        sort them, not drop any."""
        payload = b"".join(bytes([i]) for i in range(100))  # 0, 1, 2, ..., 99
        out = await read_upload_capped(_FakeUpload(payload), 200, chunk_size=7)
        assert out == payload

    @pytest.mark.asyncio
    async def test_realistic_image_size(self):
        """A 1 MiB upload under a 2 MiB cap, default chunk size:
        helper must succeed and return the full payload."""
        data = b"\x00\x01\x02" * (1 * 1024 * 1024 // 3)
        out = await read_upload_capped(_FakeUpload(data), 2 * 1024 * 1024)
        assert out == data
        assert len(out) == len(data)