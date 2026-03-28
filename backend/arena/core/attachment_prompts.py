"""Prompt fragments for Agent file attachments."""

from __future__ import annotations

from arena.core.blackboard import Blackboard


def build_attachment_text_block(bb: Blackboard) -> str:
    if not bb.attachments:
        return ""
    texts: list[str] = []
    for att in bb.attachments:
        if att.get("type") == "image":
            texts.append(f"[Image attached: {att.get('filename', 'image')}]")
        else:
            texts.append(
                f"[Document: {att.get('filename', 'file')}]\n"
                f"{(att.get('content') or '')[:1000]}"
            )
    return "ATTACHED CONTEXT:\n" + "\n\n".join(texts)


def claude_image_content_blocks(bb: Blackboard) -> list[dict]:
    blocks: list[dict] = []
    for att in bb.attachments or []:
        if att.get("type") != "image":
            continue
        b64 = att.get("b64")
        if not b64:
            continue
        mt = att.get("mime_type") or "image/jpeg"
        blocks.append(
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": mt,
                    "data": b64,
                },
            }
        )
    return blocks
