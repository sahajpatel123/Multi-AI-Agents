"""Static-analysis regression test for the CI pin-floor guard.

The pin-floor guard lives inside a `python -c "..."` heredoc in
`.github/workflows/ci.yml`. It is invisible to pytest — easy to break
silently, as the cycle-79 bash-quoting bug demonstrated. These tests
parse the heredoc out of the workflow file and assert its structural
invariants, so a future regression in the heredoc itself is caught
locally before CI runs.

What this test guards:
  1. The Python block is syntactically valid (compile() succeeds).
  2. The heredoc contains the expected FORBIDDEN entries — direct
     python-jose/ecdsa reintroductions still fail.
  3. The heredoc contains the resolved-tree walk via
     importlib.metadata.distributions() (cycle-78 hardening).
  4. The heredoc contains no inner double quotes inside the
     python -c "..." block (cycle-79 bash-quoting bug).
  5. The heredoc uses single-quoted string literals for all Python
     string content (cycle-79 hardening).

This is a structural guard, not a behavior test. Behavior is
exercised by CI itself; this just makes the heredoc visible to the
local test suite so a developer who edits the workflow without
noticing the bash-quoting trap fails their local pytest run.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

WORKFLOW = Path(__file__).resolve().parents[2] / ".github" / "workflows" / "ci.yml"


def _extract_pin_floor_block(text: str) -> tuple[str, int, int]:
    """Return (python_source, start_line, end_line) of the python -c "..."
    heredoc inside the 'Pin floor guard (security-required versions)'
    step. Raises if the heredoc cannot be located.
    """
    step_re = re.compile(
        r"name:\s*Pin floor guard[^\n]*\n\s*run:\s*\|\n(?P<indent>[ \t]*)(?P<body>.*?)(?=^\s*-?\s*name:\s|\Z)",
        re.DOTALL | re.MULTILINE,
    )
    match = step_re.search(text)
    assert match, "Pin floor guard step not found in ci.yml"
    indent = match.group("indent")
    body = match.group("body")
    # The python -c "..." block is the first non-comment line that begins
    # with `<indent>python -c "`. It spans from that line to the next
    # line that begins with `<indent>"` and contains only a single `"`.
    open_re = re.compile(
        rf"^{re.escape(indent)}python -c \"\s*$",
        re.MULTILINE,
    )
    open_match = open_re.search(body)
    assert open_match, "Could not find opening `python -c \"` line"
    after_open = body[open_match.end():]
    close_re = re.compile(rf"^{re.escape(indent)}\"\s*$", re.MULTILINE)
    close_match = close_re.search(after_open)
    assert close_match, "Could not find closing `\"` line"
    python_src = after_open[: close_match.start()].rstrip("\n")
    # Trim the indent from each line so the Python source is unindented
    # (matches what bash actually passes to python -c).
    trimmed = "\n".join(
        line[len(indent):] if line.startswith(indent) else line
        for line in python_src.splitlines()
    )
    # Approximate line numbers relative to the workflow file.
    prefix_lines = text[: text.index(body)].count("\n")
    start_line = prefix_lines + open_match.endpos
    end_line = prefix_lines + open_match.endpos + after_open[: close_match.end()].count("\n")
    return trimmed, start_line, end_line


@pytest.fixture(scope="module")
def pin_floor_block() -> tuple[str, int, int]:
    text = WORKFLOW.read_text()
    return _extract_pin_floor_block(text)


def test_workflow_file_exists():
    assert WORKFLOW.exists(), f"ci.yml not found at {WORKFLOW}"


def test_python_block_is_syntactically_valid(pin_floor_block):
    """The heredoc must be a syntactically valid Python program.

    A regression in indentation, unmatched brackets, or a typo would
    silently break CI. compile() catches all of those.
    """
    src, _, _ = pin_floor_block
    try:
        compile(src, str(WORKFLOW), "exec")
    except SyntaxError as e:
        pytest.fail(f"pin-floor guard Python block is not syntactically valid: {e}")


def test_forbidden_entries_include_python_jose_and_ecdsa(pin_floor_block):
    """The cycle-1 migration dropped python-jose; the FORBIDDEN list
    must still guard against its reintroduction."""
    src, _, _ = pin_floor_block
    assert "'python-jose'" in src
    assert "'ecdsa'" in src
    assert "PYSEC-2026-1325" in src


def test_resolved_tree_walk_present(pin_floor_block):
    """The cycle-78 hardening added a resolved-tree walk via
    importlib.metadata.distributions() so transitive reintroducers
    are caught. A future commit that deletes this walk would re-open
    the transitive reintroducer gap."""
    src, _, _ = pin_floor_block
    assert "importlib.metadata" in src
    assert "_md.distributions()" in src


def test_no_inner_double_quotes_in_python_block(pin_floor_block):
    """Cycle 79: bash terminated the python -c \"...\" argument at the
    first inner double quote, then tried to parse the rest as a
    subshell. Guard against that regression by asserting the only
    double quotes in the Python block are the outer python -c
    wrappers (which are outside the parsed range)."""
    src, _, _ = pin_floor_block
    quotes = [(i, line) for i, line in enumerate(src.splitlines(), 1) if '"' in line]
    assert not quotes, (
        "Inner double quotes in pin-floor guard Python block — bash will "
        "treat the first as the close of the python -c \"...\" argument:\n"
        + "\n".join(f"  line {i}: {line}" for i, line in quotes)
    )


def test_required_floor_dict_present(pin_floor_block):
    """The REQUIRED pin-floor dict must list at least the packages the
    cycle-1+ security audits established as floor-critical."""
    src, _, _ = pin_floor_block
    for pkg in (
        "fastapi",
        "pyasn1",
        "PyJWT",
        "python-multipart",
        "cryptography",
        "Pillow",
        "python-dotenv",
        "markdown",
        "weasyprint",
        "pytest",
    ):
        assert f"'{pkg}'" in src, f"REQUIRED floor missing for {pkg}"


def test_block_prints_security_floor_ok_on_clean(pin_floor_block):
    """The guard must end with a clear success marker so CI logs
    show it ran (vs. silently no-op'ing on a malformed rewrite)."""
    src, _, _ = pin_floor_block
    assert "print('Security floor OK')" in src or 'print("Security floor OK")' in src
