"""Unit tests for arena.core.attachment_prompts pure helpers."""

from __future__ import annotations

from types import SimpleNamespace

from arena.core.attachment_prompts import (
    build_attachment_text_block,
    claude_image_content_blocks,
)


def test_build_attachment_text_block_empty():
    bb = SimpleNamespace(attachments=[])
    assert build_attachment_text_block(bb) == ""
    bb2 = SimpleNamespace(attachments=None)
    # blackboard normally always has a list; None should not crash if coerced
    bb2.attachments = []
    assert build_attachment_text_block(bb2) == ""


def test_build_attachment_text_block_mixes_image_and_document():
    bb = SimpleNamespace(
        attachments=[
            {"type": "image", "filename": "chart.png"},
            {
                "type": "document",
                "filename": "notes.txt",
                "content": "Hello world " * 200,
            },
        ]
    )
    out = build_attachment_text_block(bb)
    assert out.startswith("ATTACHED CONTEXT:")
    assert "[Image attached: chart.png]" in out
    assert "[Document: notes.txt]" in out
    # document content is truncated to 1000 chars
    doc_section = out.split("[Document: notes.txt]\n", 1)[1]
    assert len(doc_section) <= 1000


def test_claude_image_content_blocks_filters_non_images():
    bb = SimpleNamespace(
        attachments=[
            {"type": "document", "filename": "a.txt", "content": "x"},
            {
                "type": "image",
                "filename": "p.jpg",
                "b64": "abc123",
                "mime_type": "image/jpeg",
            },
            {"type": "image", "filename": "missing-b64.png"},
        ]
    )
    blocks = claude_image_content_blocks(bb)
    assert len(blocks) == 1
    assert blocks[0]["type"] == "image"
    assert blocks[0]["source"]["data"] == "abc123"
    assert blocks[0]["source"]["media_type"] == "image/jpeg"


def test_claude_image_content_blocks_default_mime():
    bb = SimpleNamespace(
        attachments=[{"type": "image", "b64": "xyz", "filename": "x"}]
    )
    blocks = claude_image_content_blocks(bb)
    assert blocks[0]["source"]["media_type"] == "image/jpeg"
