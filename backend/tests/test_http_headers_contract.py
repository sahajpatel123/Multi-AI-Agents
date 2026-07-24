"""Regression tests for ``arena.core.http_headers`` — header-injection
guard for Content-Disposition filenames.

A user- or task-derived filename string flows directly into
``Content-Disposition: attachment; filename="..."``. If the
helper ever regresses and lets raw text through, an attacker can
inject extra header fields (``\\r\\nX-Admin: true``) or break
out of the quoted-string (an unescaped ``"``) and forge any
response header.

Pins:
  - Path separators stripped (back-slash + forward-slash)
  - Header injection vectors blocked: ``\\r``, ``\\n``, ``;``,
    CRLF, quote characters
  - Untrusted characters replaced with ``-`` (NOT removed — that
    would silently truncate words)
  - Leading/trailing ``.`` and ``-`` stripped
  - Empty / all-stripped inputs fall back to ``"download"``
  - Custom fallback supported
  - ``content_disposition_attachment`` always returns the
    ``attachment; filename="..."`` shape
  - The returned filename NEVER contains ``"`` (no breakout)
  - The returned header NEVER contains CRLF (no injection)
  - Filename truncation does not change the prefix (only suffix)
  - Unicode characters replaced (not retained) so encoding
    mismatches can't crash the response
  - ``None`` input never raises — falls back to ``download``
  - Long filenames are NOT truncated (the helper doesn't impose
    a length limit — downstream callers handle that)
"""

from __future__ import annotations

import pytest

from arena.core.http_headers import content_disposition_attachment, safe_download_filename


class TestPathSeparatorStripping:
    def test_forward_slash_strips_to_basename(self):
        assert safe_download_filename("dir/file.pdf") == "file.pdf"

    def test_back_slash_strips_to_basename(self):
        """Windows-style paths must be normalized too."""
        assert safe_download_filename("dir\\file.pdf") == "file.pdf"

    def test_mixed_slashes_strip_to_basename(self):
        assert safe_download_filename("dir/sub\\file.pdf") == "file.pdf"

    def test_traversal_attempt_neutralized(self):
        """``../etc/passwd`` must NEVER survive as a path component
        — the basename extractor removes everything before the
        last separator."""
        result = safe_download_filename("../../etc/passwd")
        assert "/" not in result
        assert ".." not in result
        # The basename "passwd" itself is fine; the dangerous
        # ``../../`` prefix is what we needed to remove.
        assert result == "passwd"

    def test_absolute_path_strips_to_basename(self):
        assert safe_download_filename("/etc/passwd") == "passwd"
        assert safe_download_filename("C:\\Windows\\system.dll") == "system.dll"


class TestHeaderInjectionVectors:
    def test_crlf_in_filename_removed(self):
        """The whole point: a CRLF in the filename would let the
        attacker inject a new header line. Pin that no ``\\r`` or
        ``\\n`` survives."""
        result = safe_download_filename("evil\r\nX-Admin: true.pdf")
        assert "\r" not in result
        assert "\n" not in result
        # And no colon-fingerprint of header fields survives.
        assert ":" not in result

    def test_quote_breakout_neutralized(self):
        """An unescaped ``"`` would terminate the
        ``Content-Disposition`` quoted-string prematurely and let
        the attacker inject garbage."""
        result = safe_download_filename('a"b.pdf')
        assert '"' not in result

    def test_semicolon_neutralized(self):
        """A ``;`` could be used to inject extra parameters into
        the header value."""
        result = safe_download_filename("a;b.pdf")
        assert ";" not in result

    def test_control_characters_replaced(self):
        """Control chars (\\x00-\\x1f, \\x7f) must not survive."""
        for ch in "\x00\x01\x0b\x1f\x7f":
            result = safe_download_filename(f"evil{ch}file.pdf")
            assert ch not in result
            assert result.endswith("file.pdf")

    def test_dollar_and_at_replaced(self):
        """``$`` and ``@`` are common shell-injection / email-
        parser vectors. The allowlist ``[A-Za-z0-9._-]`` rejects
        them — pin the contract."""
        assert "$" not in safe_download_filename("file$.pdf")
        assert "@" not in safe_download_filename("file@.pdf")


class TestUntrustedCharReplacement:
    def test_replaced_with_dash_not_dropped(self):
        """A space or non-allowlist character must become ``-``,
        not be silently deleted — that would join words together
        and obscure the original filename."""
        result = safe_download_filename("hello world.pdf")
        # Space → dash.
        assert " " not in result
        assert result == "hello-world.pdf"

    def test_multiple_runs_of_untrusted_collapse_to_single_dash(self):
        """``[^A-Za-z0-9._-]+`` (one-or-more) means a run of
        spaces becomes ONE dash, not many."""
        assert safe_download_filename("hello    world.pdf") == "hello-world.pdf"
        assert safe_download_filename("a   b   c.pdf") == "a-b-c.pdf"

    def test_existing_dashes_preserved(self):
        result = safe_download_filename("already-safe-name.pdf")
        assert result == "already-safe-name.pdf"

    def test_existing_dots_preserved(self):
        result = safe_download_filename("report.v2.pdf")
        assert result == "report.v2.pdf"


class TestLeadingTrailingTrim:
    def test_leading_dot_stripped(self):
        """A leading dot would make the file hidden on Unix — and
        could mask ``.htaccess``-style upload tricks."""
        assert safe_download_filename(".hidden") == "hidden"

    def test_trailing_dot_stripped(self):
        """A trailing dot is invalid on Windows and ambiguous on
        Unix."""
        assert safe_download_filename("file.") == "file"

    def test_leading_dash_stripped(self):
        assert safe_download_filename("-flag") == "flag"

    def test_trailing_dash_stripped(self):
        assert safe_download_filename("file-") == "file"

    def test_only_dots_and_dashes_stripped(self):
        """A filename that is ONLY dots and dashes collapses to
        empty and falls back."""
        assert safe_download_filename(".-.-.") == "download"
        assert safe_download_filename("---") == "download"


class TestFallbackBehavior:
    def test_empty_string_falls_back_to_download(self):
        assert safe_download_filename("") == "download"

    def test_only_slashes_fall_back(self):
        assert safe_download_filename("///") == "download"
        assert safe_download_filename("\\\\\\") == "download"

    def test_only_dots_fall_back(self):
        assert safe_download_filename("...") == "download"

    def test_none_input_does_not_raise(self):
        """``None`` must be defensively handled — the helper is
        fed from task-derived names and one bad upstream caller
        should never crash the response path."""
        assert safe_download_filename(None) == "download"  # type: ignore[arg-type]

    def test_custom_fallback_respected(self):
        assert safe_download_filename("", fallback="arena_export.pdf") == "arena_export.pdf"
        assert safe_download_filename("///", fallback="fallback.txt") == "fallback.txt"

    def test_non_string_input_raises_attribute_error(self):
        """A non-string non-None input (e.g. an int from a buggy
        upstream caller) raises ``AttributeError``. Pin the loud-
        failure contract: the helper does NOT silently coerce a
        bogus type into ``download`` — it surfaces the bug to the
        caller so it can be fixed upstream. (The ``None`` case is
        special-cased because ``raw or ""`` short-circuits.)"""
        with pytest.raises(AttributeError):
            safe_download_filename(42, fallback="x")  # type: ignore[arg-type]
        with pytest.raises(AttributeError):
            safe_download_filename(True, fallback="x")  # type: ignore[arg-type]


class TestContentDispositionShape:
    def test_attachment_header_shape(self):
        """Pin the exact header format — clients may parse this."""
        assert content_disposition_attachment("report.pdf") == 'attachment; filename="report.pdf"'

    def test_attachment_keyword_always_present(self):
        """Always ``attachment``, never ``inline`` (which would
        render the file in the browser instead of downloading it)."""
        for name in ["report.pdf", "a.pdf", "x"]:
            assert content_disposition_attachment(name).startswith("attachment;")

    def test_filename_always_quoted(self):
        """The filename parameter must always be wrapped in
        double-quotes — that's the only way to safely include
        special characters."""
        for name in ["a.pdf", "b c.pdf", "x"]:
            value = content_disposition_attachment(name)
            assert 'filename="' in value
            assert value.endswith('"')

    def test_no_quote_in_quoted_filename(self):
        """The interior of the quoted filename must not contain
        ``"`` — that would terminate the quoted-string early."""
        for raw in ['a"b.pdf', '"x"', 'evil"']:
            value = content_disposition_attachment(raw)
            # Extract the interior of the quoted filename.
            interior = value.split('filename="', 1)[1].rstrip('"')
            assert '"' not in interior

    def test_no_crlf_in_full_header(self):
        """The full header value must not contain CRLF —
        otherwise an attacker injecting ``\\r\\n`` into the
        filename could forge new response headers."""
        for raw in ["a\r\nX: 1.pdf", "b\r.pdf", "c\n.pdf"]:
            value = content_disposition_attachment(raw)
            assert "\r" not in value
            assert "\n" not in value


class TestUnicodeAndLongFilenames:
    def test_unicode_replaced(self):
        """Non-ASCII characters are not in the allowlist, so
        they're replaced with ``-``. This also avoids encoding
        mismatches between UTF-8 filename and ASCII header."""
        result = safe_download_filename("café.pdf")
        assert "é" not in result
        # Pin the replacement, not the exact output.
        assert "caf" in result
        assert ".pdf" in result

    def test_emoji_replaced(self):
        result = safe_download_filename("hello🚀.pdf")
        assert "🚀" not in result

    def test_long_filename_not_truncated_by_helper(self):
        """The helper does NOT impose a length limit — the full
        filename is preserved (modulo character replacement).
        Downstream HTTP middleware / browser quirks impose any
        practical limit."""
        long = "a" * 1000 + ".pdf"
        result = safe_download_filename(long)
        assert len(result) == 1004
        assert result.endswith(".pdf")

    def test_unicode_in_basename_only_keeps_safe_chars(self):
        """``naïve résumé.pdf`` → safe ASCII output."""
        result = safe_download_filename("naïve-résumé.pdf")
        # All non-allowlist chars replaced; the rest preserved.
        assert "ï" not in result
        assert "é" not in result


class TestEmptyAllowedInput:
    def test_basename_alone_is_preserved(self):
        """A clean basename passes through unchanged."""
        assert safe_download_filename("report.pdf") == "report.pdf"

    def test_alphanumeric_only_preserved(self):
        assert safe_download_filename("abc123") == "abc123"

    def test_alphanumeric_with_safe_punctuation_preserved(self):
        assert safe_download_filename("file_1.0-beta.pdf") == "file_1.0-beta.pdf"


class TestSafeFilenameRegexContract:
    """Direct tests on the regex pattern that drives the helper.
    Even though it's a private constant, pinning its character
    class ensures future refactors don't silently widen it."""

    def test_safe_chars_in_pattern(self):
        """The allowlist is ``[A-Za-z0-9._-]`` — pin it directly
        via the module attribute."""
        from arena.core import http_headers

        pattern = http_headers._SAFE_FILENAME_RE
        # Allowed chars survive.
        for ch in "abcXYZ012.-_":
            assert pattern.sub("X", ch) == ch
        # Disallowed chars get replaced.
        for ch in " /\\:;\"'@$&*()[]{}<>?!#%^`~+=,":
            assert pattern.sub("X", ch) == "X"


class TestRoundTripFromRawInput:
    """End-to-end: a malicious filename string flows through the
    helper and into a Content-Disposition header. The output
    MUST be safe to send to a browser."""

    @pytest.mark.parametrize(
        "evil_filename",
        [
            'a"; filename="evil.pdf',
            "a\r\nSet-Cookie: admin=1.pdf",
            "../../etc/passwd",
            "..\\..\\windows\\system.dll",
            "file<script>.pdf",
            "file with spaces & special; chars.pdf",
            "very" + "long" * 100 + ".pdf",
        ],
    )
    def test_evil_filename_produces_safe_header(self, evil_filename):
        value = content_disposition_attachment(evil_filename)
        # No header-injection characters survive.
        assert "\r" not in value
        assert "\n" not in value
        assert '"' not in value.split('filename="', 1)[1].rstrip('"')
        # Still parses as a valid Content-Disposition value.
        assert value.startswith("attachment; filename=")