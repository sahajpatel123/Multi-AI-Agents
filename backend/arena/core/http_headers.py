"""Safe HTTP response header helpers."""

from __future__ import annotations

import re

# Only characters safe inside a quoted Content-Disposition filename token.
_SAFE_FILENAME_RE = re.compile(r"[^A-Za-z0-9._-]+")


def safe_download_filename(raw: str, *, fallback: str = "download") -> str:
    """Sanitize a filename for Content-Disposition attachment headers.

    Strips path separators, quotes, and control characters so a user- or
    task-derived stem cannot inject header fields or path traversal.
    """
    name = (raw or "").replace("\\", "/").split("/")[-1].strip()
    name = _SAFE_FILENAME_RE.sub("-", name).strip(".-")
    return name or fallback


def content_disposition_attachment(filename: str) -> str:
    """Build a Content-Disposition attachment header value."""
    safe = safe_download_filename(filename)
    return f'attachment; filename="{safe}"'
