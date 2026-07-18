"""Regression test for the PromptRequest / DiscussRequest length contract.

Before this fix, PromptRequest.prompt and DiscussRequest.message declared
``Field(..., max_length=10000)`` in the schema, but the
``@field_validator`` rejected anything past 2000 characters with a
sanitizer error message. Clients seeing ``maxLength: 10000`` in
OpenAPI would submit 2001-10000-char prompts and get a confusing
"prompt is too long" instead of a clear 400 from the Field check.

This test pins the two bounds together by reading the source file
directly and matching on the literal ``max_length=`` keyword — no
app boot required, no circular import gymnastics.
"""

from __future__ import annotations

import re
from pathlib import Path

SCHEMAS = Path(__file__).resolve().parents[1] / "arena" / "models" / "schemas.py"


def _field_max_length(class_name: str, field_name: str) -> int | None:
    """Return the max_length declared on the given Field, or None."""
    text = SCHEMAS.read_text()
    # Find the class block, then the field declaration inside it.
    cls_re = re.compile(
        rf"^class {re.escape(class_name)}\b.*?(?=^class\s|\Z)",
        re.MULTILINE | re.DOTALL,
    )
    cls_match = cls_re.search(text)
    if cls_match is None:
        raise AssertionError(f"class {class_name} not found in {SCHEMAS}")
    block = cls_match.group(0)
    # Field line: `field_name: str = Field(..., min_length=..., max_length=N, ...)`
    field_re = re.compile(
        rf"^\s*{re.escape(field_name)}\s*:\s*\w[\w\[\] \|]*\s*=\s*Field\("
        r"[^)]*max_length\s*=\s*(\d+)",
        re.MULTILINE,
    )
    m = field_re.search(block)
    return int(m.group(1)) if m else None


def test_prompt_request_field_caps_at_2000():
    """PromptRequest.prompt Field must declare max_length=2000."""
    ml = _field_max_length("PromptRequest", "prompt")
    assert ml == 2000, f"PromptRequest.prompt max_length={ml}, expected 2000"


def test_discuss_request_message_field_caps_at_2000():
    """DiscussRequest.message Field must declare max_length=2000."""
    ml = _field_max_length("DiscussRequest", "message")
    assert ml == 2000, f"DiscussRequest.message max_length={ml}, expected 2000"