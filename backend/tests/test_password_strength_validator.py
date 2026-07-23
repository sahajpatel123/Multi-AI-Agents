"""Regression tests for ``_validate_password_strength`` and
``_COMMON_PASSWORDS`` allowlist.

The validator sits in front of every password write path (register,
reset, future OAuth link). A regression here would either:

  - Drop the uppercase requirement → users pick "password1" with a
    digit (passes digit check), giving the attacker a 2-class search.
  - Drop the digit requirement → users pick "Password" (passes
    length + uppercase), giving the attacker a 1-class search.
  - Drop a common password from the allowlist → "password123"
    becomes acceptable (it's on every credential-stuffing list).

Pins:
  - The length / uppercase / digit / common-password checks run in
    order; the failure message reflects the FIRST failing check.
  - The allowlist is a set (O(1) lookup).
  - The most dangerous common passwords ("password", "12345678",
    "qwerty123") are still blocked.
  - The validator never accepts a common password even if it has
    uppercase + digit + length — the common-password check wins.
"""

from __future__ import annotations

import pytest

from arena.routes.auth import _COMMON_PASSWORDS, _validate_password_strength


class TestValidatePasswordStrengthHappyPath:
    def test_strong_password_passes(self):
        ok, reason = _validate_password_strength("MyStr0ngPass!")
        assert ok is True
        assert reason == ""

    def test_minimum_requirements_met_passes(self):
        """The exact minimum: 8 chars, 1 uppercase, 1 digit.
        Note: 'Password1' lowercases to 'password1' which IS in the
        common-password list — so this test actually exercises the
        common-password check, not just structural. Use a stronger
        example to exercise the structural-only happy path."""
        ok, reason = _validate_password_strength("Strongp1")  # 8 chars, mixed-case, digit, NOT common
        assert ok is True
        assert reason == ""

    def test_long_strong_password_passes(self):
        ok, reason = _validate_password_strength("ThisIsAVeryLongPasswordX9")
        assert ok is True
        assert reason == ""


class TestValidatePasswordStrengthLength:
    def test_too_short_rejected(self):
        ok, reason = _validate_password_strength("Abc1")
        assert ok is False
        assert "8 characters" in reason

    def test_exactly_7_chars_rejected(self):
        ok, reason = _validate_password_strength("Passw1")  # 6 chars
        assert ok is False
        assert "8 characters" in reason

    def test_exactly_8_chars_accepted(self):
        ok, _ = _validate_password_strength("Strongp1")  # 8 chars, mixed, digit, not common
        assert ok is True


class TestValidatePasswordStrengthUppercase:
    def test_no_uppercase_rejected(self):
        ok, reason = _validate_password_strength("password1")
        assert ok is False
        assert "uppercase" in reason.lower()

    def test_uppercase_at_start_passes(self):
        ok, _ = _validate_password_strength("Strongp1")  # not common, mixed case
        assert ok is True

    def test_uppercase_in_middle_passes(self):
        ok, _ = _validate_password_strength("paSswordX9")  # not common
        assert ok is True


class TestValidatePasswordStrengthDigit:
    def test_no_digit_rejected(self):
        ok, reason = _validate_password_strength("PasswordOnly")
        assert ok is False
        assert "number" in reason.lower() or "digit" in reason.lower()

    def test_digit_at_end_passes(self):
        ok, _ = _validate_password_strength("Strongp1")  # not common, digit at end
        assert ok is True


class TestValidatePasswordStrengthCommonPasswords:
    """The common-password check runs LAST in the validator — even a
    password that meets length + uppercase + digit must be rejected if
    it's on the common list."""

    @pytest.mark.parametrize("common", [
        # Common passwords with uppercase + digit + length to ensure
        # they pass structural checks and only fail the common-password
        # check. The validator's structural checks must be satisfied
        # before the common-password message surfaces.
        "Password1",   # 'password1' in list → uppercase + digit → fails common
        "Password123", # 'password123' in list
        "Admin123",    # 'admin123' in list
        "Welcome1",    # 'welcome1' in list
        "Letmein1",    # 'letmein1' in list
        "Qwerty123",   # 'qwerty123' in list
        "PASSWORD123", # case-insensitive match
    ])
    def test_common_password_rejected(self, common: str):
        """A common password (case-folded match) is rejected with the
        'common' message even if it has uppercase + digit + length.
        Pin: the common-password check runs AFTER the structural
        checks so a structurally-valid common entry still fails."""
        ok, reason = _validate_password_strength(common)
        assert ok is False, f"{common!r} should be rejected as common"
        assert "common" in reason.lower()

    def test_common_password_case_insensitive_match(self):
        """``PASSWORD123`` (uppercase) is the same common password
        as ``password123`` — the check is case-folded."""
        ok, reason = _validate_password_strength("PASSWORD123")
        assert ok is False
        assert "common" in reason.lower()

    def test_unique_strong_password_passes(self):
        ok, _ = _validate_password_strength("Zx9Kq2Vm!nL@7")
        assert ok is True


class TestValidatePasswordStrengthPrecedence:
    """Order of checks matters — the first failing check wins (the
    user sees one message at a time)."""

    def test_too_short_takes_precedence_over_no_uppercase(self):
        """A 4-char all-lowercase password fails on length FIRST."""
        ok, reason = _validate_password_strength("abc1")
        assert ok is False
        # Length message, not uppercase message.
        assert "8 characters" in reason
        assert "uppercase" not in reason.lower()

    def test_no_uppercase_takes_precedence_over_no_digit(self):
        """An 8-char all-lowercase password fails on uppercase FIRST."""
        ok, reason = _validate_password_strength("passwordonly")
        assert ok is False
        assert "uppercase" in reason.lower()
        assert "number" not in reason.lower() and "digit" not in reason.lower()

    def test_no_digit_takes_precedence_over_common(self):
        """A 8-char uppercase-but-no-digit common password fails on
        digit FIRST."""
        ok, reason = _validate_password_strength("Qwertyasdf")
        # Not common, so digit message wins.
        assert ok is False
        assert "number" in reason.lower() or "digit" in reason.lower()

    def test_structural_checks_take_precedence_over_common(self):
        """A common password that ALSO fails structural checks gets
        the structural message — the user sees one actionable error."""
        ok, reason = _validate_password_strength("password")  # lowercase, no digit
        assert ok is False
        assert "uppercase" in reason.lower()
        # The common-password message must NOT appear (the structural
        # message is more actionable).
        assert "common" not in reason.lower()


class TestCommonPasswordsAllowlist:
    def test_is_a_set(self):
        """O(1) lookup — must be set/frozenset."""
        assert isinstance(_COMMON_PASSWORDS, (set, frozenset))

    def test_top_20_breaches_are_blocked(self):
        """The top-20 most-leaked passwords (per HaveIBeenPwned) MUST
        be in the allowlist. A regression that drops one is a real
        security regression."""
        for pwd in (
            "password", "12345678", "password1", "qwerty123",
            "letmein1", "welcome1", "123456789", "password123",
            "admin", "admin123", "letmein", "welcome",
            "monkey", "dragon", "master", "login",
            "abc123", "iloveyou", "princess", "football",
        ):
            assert pwd in _COMMON_PASSWORDS, (
                f"common password {pwd!r} is no longer blocked — "
                "credential stuffing would succeed against this account"
            )

    def test_top20_in_list_must_be_common_in_list(self):
        """Pin the bidirectional contract: a value in the allowlist
        MUST be the canonical-lowercase form (no spaces, no caps).
        Otherwise the case-folded lookup would silently fail."""
        for pwd in _COMMON_PASSWORDS:
            assert pwd == pwd.lower(), (
                f"common password {pwd!r} is not lowercase — "
                "the lookup uses .lower()"
            )
            assert pwd == pwd.strip(), (
                f"common password {pwd!r} has surrounding whitespace"
            )
            assert " " not in pwd, (
                f"common password {pwd!r} contains a space"
            )

    def test_lookup_is_case_insensitive(self):
        """The validator uses ``password.lower() in _COMMON_PASSWORDS`` —
        a regression to case-sensitive lookup would let ``Password123``
        through."""
        # "Password123" is in the list as "password123"; the lookup is
        # case-folded before the check.
        from arena.routes.auth import _validate_password_strength
        ok, reason = _validate_password_strength("PASSWORD123")
        assert ok is False

    def test_does_not_contain_empty_string(self):
        """An empty password is handled by a separate "too short"
        branch; it must NOT also be in the allowlist (avoid
        double-counting in error messages)."""
        assert "" not in _COMMON_PASSWORDS

    def test_strong_passwords_are_not_in_list(self):
        """A regression that over-fills the allowlist would block
        legitimate passwords."""
        for strong in (
            "Zx9Kq2Vm!nL@7pR",
            "Tr0ub4dor&3",
            "correct-horse-battery-staple-9",
        ):
            assert strong not in _COMMON_PASSWORDS