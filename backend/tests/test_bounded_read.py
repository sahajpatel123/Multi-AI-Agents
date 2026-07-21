"""Unit tests for bounded upload streaming reads."""

from __future__ import annotations

import pytest

from arena.core.bounded_read import UploadTooLargeError, read_upload_capped


class _FakeUpload:
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


@pytest.mark.asyncio
async def test_read_exact_cap():
    data = b"a" * 100
    out = await read_upload_capped(_FakeUpload(data), 100, chunk_size=32)
    assert out == data


@pytest.mark.asyncio
async def test_read_under_cap():
    data = b"hello"
    out = await read_upload_capped(_FakeUpload(data), 1024, chunk_size=2)
    assert out == data


@pytest.mark.asyncio
async def test_oversize_aborts_without_retaining_full_body():
    # 250 bytes with a 100-byte cap — reader must raise once cumulative
    # exceeds, and must not keep reading the entire remainder.
    fake = _FakeUpload(b"x" * 250)
    with pytest.raises(UploadTooLargeError):
        await read_upload_capped(fake, 100, chunk_size=40)
    # At most one overshoot chunk past the cap: 100 + chunk_size.
    assert fake.bytes_delivered <= 100 + 40
    assert fake.bytes_delivered < 250


@pytest.mark.asyncio
async def test_empty_upload():
    out = await read_upload_capped(_FakeUpload(b""), 10)
    assert out == b""
