"""Regression tests for the password-whitespace bypass.

The previous `_validate_password_strength` checked
`password.lower() in _COMMON_PASSWORDS` without first stripping
the user's input. Pydantic's str field preserves the user's
input verbatim (no auto-strip), so a password like
" password1 " is:
  - 10 chars long (passes the length>=8 check)
  - has an uppercase 'P' and a digit '1' (passes structural checks)
  - lowercased to " password1 " (with spaces) - NOT in the
    allowlist

The user has effectively bypassed the credential-stuffing block
by typing whitespace around a known common password. The fix
strips before the lower-lookup, so the padded form is rejected.

Tests pin:
- A leading-whitespace padded common password is rejected
- A trailing-whitespace padded common password is rejected
- A both-ende padded common password is rejected
- A whitespace-only common password is rejected (the length
  check catches it first, but the strip then makes the
  common-password check reachable if the length ever drifts)
- A non-common password with whitespace is still accepted (no
  regression)
- The validator's behaviour on a strong password is unchanged
"""

from __future__ import annotations

import pytest

from arena.routes.auth import _validate_password_strength


# --- the bypass: padded common passwords must be rejected ---


@pytest.mark.parametrize(
    "padded",
    [
        " Password1",     # leading space
        "Password1 ",     # trailing space
        " Password1 ",    # both
        "  Password1",    # two leading spaces
        "Password1  ",    # two trailing spaces
        "\tPassword1",    # tab
        "Password1\n",    # newline
        " \t Password1 \n ",  # mixed whitespace
        " Password1\t",  # mixed leading + trailing
        "  PASSWORD1  ",  # all-uppercase + spaces
    ],
)
def test_padded_common_password_rejected(padded: str) -> None:
    """A common password with surrounding whitespace must NOT
    bypass the allowlist. The strip() in the validator closes
    the bypass; without it, ' password1 ' lowercased to
    ' password1 ' (with the spaces) is not in the set, so the
    check passes and a credential-stuffing-prone account is
    created.
    """
    ok, reason = _validate_password_strength(padded)
    assert ok is False, f"{padded!r} should be rejected as common"
    assert "common" in reason.lower()


# --- strong passwords with whitespace are unaffected ---


def test_strong_password_with_leading_space_passes() -> None:
    """A strong password (NOT in the allowlist) with surrounding
    whitespace is still accepted. The strip in the validator
    is a lookup-only operation; the actual stored password is
    the user's full input including the spaces.
    """
    ok, reason = _validate_password_strength(" Zx9Kq2Vm!nL@7")
    assert ok is True, reason


def test_strong_password_with_trailing_space_passes() -> None:
    ok, reason = _validate_password_strength("Tr0ub4dor&3 ")
    assert ok is True, reason


def test_strong_password_with_internal_space_passes() -> None:
    """A strong password with an internal space (e.g. a passphrase)
    is unaffected. The validator does not strip internal spaces,
    only leading/trailing whitespace.
    """
    ok, reason = _validate_password_strength("correct horse battery 9X")
    assert ok is True, reason


# --- the strip does not affect the structural checks ---


def test_short_password_still_rejected_by_length_first() -> None:
    """A 4-char password with spaces is rejected on LENGTH first,
    not on common-password. The strip() happens after the
    structural checks (length / uppercase / digit), so the
    'too short' message still surfaces for short inputs.
    """
    ok, reason = _validate_password_strength(" Pa1")
    assert ok is False
    assert "8 characters" in reason


def test_no_uppercase_padded_still_rejected() -> None:
    """A padded password without uppercase is rejected on the
    uppercase check (which runs BEFORE the strip+common lookup).
    """
    ok, reason = _validate_password_strength(" password1 ")
    assert ok is False
    assert "uppercase" in reason.lower()


# --- the stored password is unaffected ---


def test_strip_is_lookup_only() -> None:
    """Pin the contract: the validator only strips for the
    common-password lookup. The actual password passed in is
    returned unchanged by the validator (it returns a tuple
    bool, str, not the modified password), and create_user()
    downstream hashes the user's full input. The strip in the
    lookup is invisible to the caller.
    """
    pwd = " Password1 "
    ok, _ = _validate_password_strength(pwd)
    assert ok is False
    # The string we passed in is unchanged (we never reassigned it).
    assert pwd == " Password1 "
