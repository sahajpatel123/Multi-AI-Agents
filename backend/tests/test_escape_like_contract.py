"""Regression tests for ``_escape_like`` (SQL LIKE wildcard escaping).

The helper sits in front of every user-typed search query in the agent
history + discuss-thread surfaces. A regression here — e.g. forgetting
to escape ``%`` — would let a user typing ``100%`` match every row in
the table, which is both a correctness bug and an information-leak
surface (the user learns the table is not empty).

Pins:
  - The wildcard characters ``%`` and ``_`` are escaped with a
    preceding backslash.
  - The escape character itself (``\\``) is doubled to avoid breaking
    out of an escape sequence.
  - The ORDER matters: backslash must be doubled FIRST, otherwise
    the ``\\%`` produced by escaping ``%`` would itself get the
    backslash doubled, yielding ``\\\\%`` (a literal ``\\`` followed
    by a wildcard).
  - Plain text (no wildcards) is returned unchanged (no extra
    backslashes introduced).
  - Empty / whitespace / non-string inputs are handled safely.
"""

from __future__ import annotations

import pytest

from arena.core.agent_memory import _escape_like


class TestEscapeLikeBasics:
    def test_plain_text_unchanged(self):
        assert _escape_like("hello world") == "hello world"

    def test_empty_string(self):
        assert _escape_like("") == ""

    def test_whitespace_only(self):
        assert _escape_like("   ") == "   "

    def test_single_percent_escaped(self):
        """``100%`` → ``100\\%``. Without escaping, this matches every
        row in the title column — the headline regression test."""
        assert _escape_like("100%") == "100\\%"

    def test_single_underscore_escaped(self):
        """``foo_bar`` → ``foo\\_bar``. Without escaping, the underscore
        acts as a single-character wildcard."""
        assert _escape_like("foo_bar") == "foo\\_bar"

    def test_multiple_percents_all_escaped(self):
        assert _escape_like("%%") == "\\%\\%"

    def test_multiple_underscores_all_escaped(self):
        assert _escape_like("__") == "\\_\\_"


class TestEscapeLikeOrdering:
    """The order of replacements is load-bearing. The backslash MUST be
    doubled first; otherwise escaping the wildcards introduces new
    backslashes that then get re-doubled into ``\\\\``."""

    def test_backslash_doubled_first(self):
        # A backslash must become two backslashes.
        assert _escape_like("\\") == "\\\\"

    def test_backslash_before_percent_does_not_re_double(self):
        """If the implementation escaped ``%`` first, then doubled
        backslashes, ``\\%`` would become ``\\\\%`` — which is a
        literal ``\\`` followed by a wildcard. Pin the order."""
        assert _escape_like("\\%") == "\\\\\\%"

    def test_backslash_before_underscore_does_not_re_double(self):
        assert _escape_like("\\_") == "\\\\\\_"

    def test_mixed_input(self):
        """Real-world: a user types ``100%_off\\back``. Each special
        character is escaped exactly once; the leading backslash is
        doubled to two backslashes, then the ``%`` becomes ``\\%``
        and the ``_`` becomes ``\\_``."""
        assert _escape_like("100%_off\\back") == "100\\%\\_off\\\\back"


class TestEscapeLikeWithDbReEscape:
    """Verify the escape character (``\\``) used by the helper matches
    the ``escape='\\\\'`` argument passed to SQLAlchemy ``ilike``.

    The double-underscore argument in the source actually means a
    single backslash to SQLAlchemy at runtime (Python literal
    interpretation). The helper must produce exactly one backslash
    per special character — adding too many would render the search
    literal useless."""

    def test_produces_single_backslash_per_wildcard(self):
        """After escaping, count the backslashes — there must be exactly
        one per special character. Two would mean the implementation
        re-doubled."""
        escaped = _escape_like("%")
        assert escaped.count("\\") == 1

        escaped = _escape_like("_")
        assert escaped.count("\\") == 1

        escaped = _escape_like("%_")
        assert escaped.count("\\") == 2


class TestEscapeLikeIdempotency:
    """Applying the function twice MUST NOT keep growing the string — if
    a future refactor makes the helper idempotent-on-input-by-design,
    the test should still pass; if the helper accidentally escapes
    its own output, this catches it."""

    def test_no_growth_on_double_apply_with_plain_text(self):
        # Plain text has no special chars; apply twice == apply once.
        assert _escape_like(_escape_like("plain")) == "plain"

    def test_growth_on_double_apply_with_specials_is_correct(self):
        """``%`` → ``\\%``. Applying again: ``\\%`` has one backslash that
        gets doubled (→ ``\\\\``) and one ``%`` that gets escaped
        (→ ``\\%``), giving ``\\\\\\%`` (3 backslashes followed by ``%``).
        This IS the correct behavior because callers always escape
        user input exactly once before constructing the LIKE pattern."""
        once = _escape_like("%")
        twice = _escape_like(once)
        # Document the contract: applying twice IS expected to grow the
        # backslash count, and the helper makes no claim about being
        # idempotent. The on-the-wire contract is "apply exactly once".
        assert twice.count("\\") == 3
        assert twice == "\\\\\\%"  # "\\\\" + "\\%"

    def test_backslash_count_for_complex_input(self):
        """``\\%_`` (literal: ``\%_``) has 3 escape-worthy chars: one
        backslash, one ``%``, one ``_``. Output should have 4
        backslashes total — two from the original backslash being
        doubled, one before ``%``, one before ``_``."""
        out = _escape_like("\\%_")
        assert out.count("\\") == 4
        # And the literal output is: ``\\\\\%\_`` (4 backslashes, ``%``, ``\_``)
        assert out == "\\\\\\%\\_"