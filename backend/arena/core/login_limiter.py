"""IP-based rate limiter for auth endpoints (login, registration).

Security contract
-----------------
Failed attempts are recorded **after** authentication / validation fails —
never before. The previous API pre-recorded every request as a failure at
the top of the handler, which meant:

  1. After (max_attempts - 1) bad passwords, a *correct* password still
     locked the IP out before bcrypt ran (legitimate recovery blocked).
  2. Successful logins briefly polluted the failure bucket until a second
     "success=True" call cleared it (racey under concurrent requests).

API:
  - ``assert_not_locked(request)`` — call first; 429 if currently locked.
  - ``record_failure(request)`` — call only after a confirmed failure.
  - ``clear(request)`` — call after a confirmed success.

``check_and_record`` remains as a thin compatibility wrapper used only
where call sites have not been migrated; new code must use the explicit
API above.
"""

from __future__ import annotations

import time
from collections import defaultdict
from threading import Lock

from fastapi import HTTPException, Request


class LoginRateLimiter:
    """Tracks failed attempts per IP within a sliding window.

    On exceeding max_attempts, the IP is locked out for lockout_seconds.
    A successful attempt clears the failure record for that IP.
    """

    def __init__(
        self,
        max_attempts: int = 5,
        window_seconds: int = 3600,
        lockout_seconds: int = 3600,
    ):
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self.lockout_seconds = lockout_seconds
        self._attempts: dict[str, list[float]] = defaultdict(list)
        self._lockouts: dict[str, float] = {}
        self._lock = Lock()

    @staticmethod
    def get_client_ip(request: Request) -> str:
        # Shared extractor: never trust leftmost X-Forwarded-For (spoofable).
        from arena.core.client_ip import get_request_client_ip

        return get_request_client_ip(request)

    def _raise_locked(self, remaining: int) -> None:
        raise HTTPException(
            status_code=429,
            detail={
                "error": "too_many_attempts",
                "message": (
                    f"Too many failed attempts. "
                    f"Try again in {remaining // 60 or 1} minute(s)."
                ),
                "retry_after": remaining,
            },
            # Standard HTTP retry hint — well-behaved clients honor it
            # to back off without polling. Without this header, only
            # well-behaved clients reading the body know how long to
            # wait, which leads to thundering-herd lockout churn.
            headers={"Retry-After": str(max(1, remaining))},
        )

    def assert_not_locked(self, request: Request) -> None:
        """Raise 429 if this IP is currently locked out. Does not record."""
        ip = self.get_client_ip(request)
        now = time.time()
        with self._lock:
            lockout_until = self._lockouts.get(ip)
            if lockout_until is None:
                return
            if now < lockout_until:
                self._raise_locked(int(lockout_until - now))
            del self._lockouts[ip]

    def remaining_attempts(self, request: Request) -> int:
        """How many more failures the caller can sustain before lockout.

        Exposed so the login route can attach `remaining_attempts` to
        the 401 response — a UI can render '3 attempts remaining' so
        users know they're approaching the threshold before it bites.
        Returns max_attempts when no failures have been recorded yet.
        """
        ip = self.get_client_ip(request)
        now = time.time()
        with self._lock:
            bucket = [
                t for t in self._attempts.get(ip, []) if now - t < self.window_seconds
            ]
            return max(0, self.max_attempts - len(bucket))

    def record_failure(self, request: Request) -> None:
        """Record a confirmed failed attempt; may lock the IP and raise 429.

        Call only after authentication or validation has actually failed.
        The failure that crosses max_attempts both locks the IP and raises
        so the client learns the lockout immediately.
        """
        ip = self.get_client_ip(request)
        now = time.time()
        with self._lock:
            lockout_until = self._lockouts.get(ip)
            if lockout_until is not None and now < lockout_until:
                self._raise_locked(int(lockout_until - now))
            if lockout_until is not None and now >= lockout_until:
                del self._lockouts[ip]

            bucket = [
                t for t in self._attempts[ip] if now - t < self.window_seconds
            ]
            bucket.append(now)
            self._attempts[ip] = bucket

            if len(bucket) >= self.max_attempts:
                self._lockouts[ip] = now + self.lockout_seconds
                self._attempts[ip] = []
                raise HTTPException(
                    status_code=429,
                    detail={
                        "error": "too_many_attempts",
                        "message": (
                            f"Too many failed attempts. "
                            f"Locked out for {self.lockout_seconds // 3600 or 1} hour(s)."
                        ),
                        "retry_after": self.lockout_seconds,
                    },
                    headers={"Retry-After": str(self.lockout_seconds)},
                )

    def clear(self, request: Request) -> None:
        """Clear failure history for this IP after a confirmed success."""
        ip = self.get_client_ip(request)
        with self._lock:
            self._attempts[ip] = []
            # Do not lift an active lockout on success from a different
            # path — lockout is time-based. Successful auth only clears
            # the sliding failure window so the user is not one bad try
            # from locking themselves after recovering.
            # (If they are locked, assert_not_locked already blocked them.)

    def check_and_record(self, request: Request, *, success: bool = False) -> None:
        """Compatibility wrapper.

        ``success=False`` → assert_not_locked only (does **not** pre-record).
        ``success=True`` → clear failures.

        Call sites that still use the old "record failure at entry" pattern
        must be migrated to ``record_failure`` after the real failure. This
        wrapper intentionally no longer pre-records, so a bare entry call
        does not burn attempts.
        """
        if success:
            self.clear(request)
            return
        self.assert_not_locked(request)

    def reset(self) -> None:
        """Drop all state (tests only)."""
        with self._lock:
            self._attempts.clear()
            self._lockouts.clear()


# Singleton instances
login_limiter = LoginRateLimiter(
    max_attempts=5,
    window_seconds=3600,
    lockout_seconds=3600,
)

registration_limiter = LoginRateLimiter(
    max_attempts=3,
    window_seconds=3600,
    lockout_seconds=86400,  # 24 hours
)
