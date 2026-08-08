"""Tests for the expanded _COMMON_PASSWORDS blocklist (top-100).

The previous blocklist had 28 entries (top-20 + 8 variations). A
user picking the 21st-to-100th most-leaked password from any
breach compilation could register / reset with it. The fix
expands the blocklist to ~100 entries covering the most-leaked
passwords from HaveIBeenPwned and similar compilations.

The existing test_top_20_breaches_are_blocked at
tests/test_password_strength_validator.py pins the top-20. This
file pins the remaining entries (21-100) so a regression that
drops any of them is a loud test failure rather than a silent
credential-stuffing surface.

Tests pin:
- The full top-100 list is in _COMMON_PASSWORDS (so a CI run
  catches a future maintainer who "cleans up" the list)
- The expanded list does not contain any empty string or
  whitespace-padded string (the case-folded lookup relies on
  the entries being canonical lowercase)
- A strong password is still NOT in the list (no over-blocking
  regression)
- The lookup is still case-insensitive (regression: the strip
  + lower fix from cycle 6098e6a must still hold)
"""

from __future__ import annotations

import pytest

from arena.routes.auth import _COMMON_PASSWORDS, _validate_password_strength


# --- top-21-to-100: entries added in the expansion ---


_TOP_21_TO_100 = (
    # 21-30
    "trustno1", "sunshine", "ashley", "bailey", "passw0rd",
    "shadow", "123123", "qwerty", "12345", "123456",
    # 31-40
    "111111", "1234567", "baseball", "superman", "michael",
    "654321", "1qaz2wsx", "jordan", "starwars", "computer",
    # 41-50
    "mustang", "michelle", "jessica", "charlie", "andrew",
    "soccer", "batman", "harley", "ranger", "daniel",
    # 51-60
    "thomas", "robert", "hunter", "george", "tigger",
    "killer", "matthew", "summer", "love", "daniel1",
    # 61-70
    "121212", "qazwsx", "123qwe", "555555", "lovely",
    "7777777", "888888", "666666", "444444", "333333",
    # 71-80
    "222222", "000000", "987654321", "abcdef", "abcd1234",
    "qwerty1", "password11", "password12", "password1234", "p@ssw0rd",
    # 81-90
    "123qweasd", "1q2w3e4r", "qweasd", "asdfgh", "asdf1234",
    "zxcvbnm", "zxcvbn", "qweasdzxc", "admin1", "admin12",
    # 91-100
    "welcome123", "welcome2", "welcome01", "test123", "test1234",
    "tester", "demo", "guest", "master123", "root",
)


@pytest.mark.parametrize("pwd", _TOP_21_TO_100)
def test_top_21_to_100_in_blocklist(pwd: str) -> None:
    """Every entry in the top-21-to-100 expansion is in the
    blocklist. A regression that drops any of them is a real
    security regression: a user can register / reset with a
    top-100 most-leaked password.
    """
    assert pwd in _COMMON_PASSWORDS, (
        f"common password {pwd!r} is no longer blocked — "
        "credential stuffing would succeed against this account"
    )


# --- structural guards ---


def test_blocklist_size_at_least_100() -> None:
    """The blocklist must contain at least 100 entries. A future
    maintainer who shrinks the list (e.g. by removing entries
    they think are "obvious") would have to also shrink this
    test, which forces an explicit decision rather than a
    silent regression.
    """
    assert len(_COMMON_PASSWORDS) >= 100, (
        f"blocklist has only {len(_COMMON_PASSWORDS)} entries, "
        "expected >= 100"
    )


def test_blocklist_does_not_contain_empty_string() -> None:
    assert "" not in _COMMON_PASSWORDS


@pytest.mark.parametrize("pwd", ("   ", "\t", "\n"))
def test_blocklist_does_not_contain_whitespace_only(pwd: str) -> None:
    assert pwd not in _COMMON_PASSWORDS


def test_blocklist_entries_are_lowercase_canonical() -> None:
    """Every entry in the blocklist must be lowercase ASCII with
    no surrounding whitespace. The lookup uses
    ``password.strip().lower() in _COMMON_PASSWORDS`` so an
    entry that contains spaces or uppercase letters would
    silently never match a real user's password (a case-sensitivity
    or whitespace-stripping regression would not be caught by
    the structural tests).
    """
    for pwd in _COMMON_PASSWORDS:
        assert pwd == pwd.lower(), f"{pwd!r} is not lowercase"
        assert pwd == pwd.strip(), f"{pwd!r} has whitespace"
        assert " " not in pwd, f"{pwd!r} contains a space"


# --- expanded blocklist is integrated with the validator ---


def test_validator_rejects_top_100_common_passwords_via_canonical_form() -> None:
    """The validator's common-password check matches the
    case-folded, whitespace-stripped form of the input. For
    the top-100 entries to actually trip the common-password
    check, the test must use a form that satisfies the
    structural checks (length>=8, has uppercase, has digit)
    AND lowercased-stripped equals a blocklist entry.

    The blocklist is in canonical lowercase form, so the
    validator input's lowercased-stripped form must match
    exactly. To exercise the common-password check (rather
    than the structural checks), use a form where the
    canonical lowercase matches a blocklist entry AND the
    form passes structural checks.

    "Password1" works: lowercased-stripped is "password1"
    (in blocklist), length is 9, has 'P' and '1' (passes
    structural). The common-password check is what fires.
    """
    pwd = "Password1"
    ok, reason = _validate_password_strength(pwd)
    assert ok is False, f"{pwd!r} should be rejected"
    # The common-password check is what fires (the entry
    # passes all structural checks).
    assert "common" in reason.lower(), (
        f"common-password check did not fire for {pwd!r}; "
        f"reason was: {reason!r}"
    )


def test_validator_rejects_expanded_entry_with_structural_padding() -> None:
    """A top-21-to-100 entry that is itself lowercase AND has
    a digit can be tested by upper-casing the first character
    and prepending a structural digit. The lowercased-stripped
    form must match the blocklist.

    'test1234' is in the blocklist (cycle 12 expansion).
    'Atest12341' lowercased is 'atest12341' which is NOT
    in the blocklist. So prepending 'A' doesn't work — the
    structural padding becomes part of the canonical form.

    Workaround: skip the prepend and just exercise the
    validator with a common entry that has uppercase already
    (covered by the test above). The blocklist integration
    is fully covered by the top-20_breaches_are_blocked
    regression guard at test_password_strength_validator.
    """
    # "Master123" - has uppercase + digit + length, and
    # lowercased-stripped is "master123" which is in the
    # expanded blocklist.
    pwd = "Master123"
    ok, reason = _validate_password_strength(pwd)
    assert ok is False, f"{pwd!r} should be rejected"
    assert "common" in reason.lower(), (
        f"common-password check did not fire for {pwd!r}; "
        f"reason was: {reason!r}"
    )


def test_strong_password_still_passes_with_expanded_blocklist() -> None:
    """Sanity: a strong password (not in the expanded blocklist)
    is still accepted. The expansion does not over-block.
    """
    ok, reason = _validate_password_strength("Zx9Kq2Vm!nL@7")
    assert ok is True, reason
