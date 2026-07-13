"""Extract text / image payloads from uploaded bytes for Agent pipeline."""

from __future__ import annotations

import base64
import logging
import os
import re
from io import BytesIO
from typing import Any, Tuple

import magic

logger = logging.getLogger(__name__)

MAX_TEXT = 3000
DISALLOWED_EXTENSIONS = {".exe", ".sh", ".py", ".js"}
ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/jpeg",
    "image/png",
    "image/webp",
    "text/plain",
}


def _truncate(s: str, n: int = MAX_TEXT) -> str:
    s = (s or "").strip()
    if len(s) <= n:
        return s
    return s[:n]


def extract_pdf_text(path: str) -> str:
    import pdfplumber

    chunks: list[str] = []
    with pdfplumber.open(path) as pdf:
        for page in (pdf.pages or [])[:3]:
            try:
                t = page.extract_text() or ""
            except Exception:
                t = ""
            if t:
                chunks.append(t)
    return _truncate("\n".join(chunks))


def extract_docx_bytes(data: bytes) -> str:
    from docx import Document

    doc = Document(BytesIO(data))
    paras = [p.text for p in doc.paragraphs if p.text]
    return _truncate("\n".join(paras))


def extract_plain_text(data: bytes) -> str:
    try:
        return _truncate(data.decode("utf-8", errors="ignore"))
    except Exception:
        return ""


def image_b64_and_mime(data: bytes, content_type: str) -> Tuple[str, str]:
    from PIL import Image

    im = Image.open(BytesIO(data))
    im.load()
    mime = content_type.split(";")[0].strip().lower()
    if mime not in ("image/png", "image/jpeg", "image/webp"):
        im = Image.open(BytesIO(data))
        fmt = (im.format or "PNG").upper()
        if fmt == "JPEG":
            mime = "image/jpeg"
        elif fmt == "PNG":
            mime = "image/png"
        elif fmt == "WEBP":
            mime = "image/webp"
        else:
            mime = "image/jpeg"
    b64 = base64.b64encode(data).decode("ascii")
    return b64, mime


def process_upload(
    *,
    filename: str,
    content_type: str,
    data: bytes,
    dest_path: str,
) -> dict[str, Any]:
    """Return registry record: file_id, filename, type, content, b64?, mime_type?, path."""
    ext = os.path.splitext((filename or "").lower())[1]
    if ext in DISALLOWED_EXTENSIONS:
        raise ValueError("Executable and script uploads are not allowed.")

    detected_mime = magic.from_buffer(data, mime=True)
    if detected_mime not in ALLOWED_MIME_TYPES:
        raise ValueError("Unsupported file type.")

    os.makedirs(os.path.dirname(dest_path) or ".", exist_ok=True)
    with open(dest_path, "wb") as f:
        f.write(data)

    ct = detected_mime
    name_lower = (filename or "").lower()

    if ct == "application/pdf":
        text = extract_pdf_text(dest_path)
        return {
            "filename": filename,
            "type": "pdf",
            "content": text,
            "mime_type": "application/pdf",
            "path": dest_path,
        }

    if ct in ("image/png", "image/jpeg", "image/webp"):
        b64, mime = image_b64_and_mime(data, ct or "image/jpeg")
        return {
            "filename": filename,
            "type": "image",
            "content": "",
            "b64": b64,
            "mime_type": mime,
            "path": dest_path,
        }

    if ct == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        text = extract_docx_bytes(data)
        return {
            "filename": filename,
            "type": "doc",
            "content": text,
            "mime_type": ct,
            "path": dest_path,
        }

    if ct == "application/msword" or name_lower.endswith(".doc"):
        if data[:2] == b"PK":
            text = extract_docx_bytes(data)
            return {
                "filename": filename,
                "type": "doc",
                "content": text,
                "mime_type": ct,
                "path": dest_path,
            }
        raise ValueError(
            "Legacy .doc format is not supported. Please save as .docx or PDF."
        )

    text = extract_plain_text(data)
    return {
        "filename": filename,
        "type": "doc",
        "content": text,
        "mime_type": ct or "text/plain",
        "path": dest_path,
    }
