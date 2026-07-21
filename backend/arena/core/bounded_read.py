"""Bounded async body readers for upload endpoints.

Reading ``await file.read()`` with no cap materializes the entire body
in memory before any size check — a crafted multipart upload can spike
process RSS to gigabytes. These helpers stream in chunks and abort as
soon as the declared ceiling is crossed.
"""

from __future__ import annotations

from typing import Protocol


class _AsyncReadable(Protocol):
    async def read(self, size: int = -1) -> bytes: ...


class UploadTooLargeError(ValueError):
    """Raised when a streaming read exceeds ``max_bytes``."""


DEFAULT_CHUNK_SIZE = 64 * 1024


async def read_upload_capped(
    file: _AsyncReadable,
    max_bytes: int,
    *,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
) -> bytes:
    """Read an upload stream up to ``max_bytes`` inclusive.

    Stops as soon as cumulative bytes would exceed the ceiling and raises
    ``UploadTooLargeError`` without retaining the oversize tail.
    """
    if max_bytes < 0:
        raise ValueError("max_bytes must be >= 0")
    if chunk_size < 1:
        raise ValueError("chunk_size must be >= 1")

    chunks: list[bytes] = []
    total = 0
    while True:
        # Never request more than remaining capacity + 1 so a single
        # oversized chunk still trips the guard without buffering past it.
        remaining = max_bytes - total
        to_read = min(chunk_size, remaining + 1)
        chunk = await file.read(to_read)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise UploadTooLargeError(
                f"upload exceeds max_bytes={max_bytes} (got at least {total})"
            )
        chunks.append(chunk)
    return b"".join(chunks)
