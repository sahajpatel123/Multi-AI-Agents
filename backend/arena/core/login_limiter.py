"""IP-based rate limiter for auth endpoints (login, registration)."""

import time
from collections import defaultdict
from threading import Lock

from fastapi import HTTPException, Request


class LoginRateLimiter:
    """
    Tracks failed attempts per IP within a sliding window.
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
        self._attempts: dict = defaultdict(list)
        self._lockouts: dict = {}
        self._lock = Lock()

    # ── helpers ──────────────────────────────────────────────

    @staticmethod
    def get_client_ip(request: Request) -> str:
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    # ── public API ───────────────────────────────────────────

    def check_and_record(self, request: Request, *, success: bool = False) -> None:
        """
        Call this at the start of an auth endpoint.

        - Before authentication: pass success=False to record a potential failure.
        - After confirmed success: call again with success=True to clear the record.

        Raises HTTPException(429) if the IP is currently locked out.
        """
        ip = self.get_client_ip(request)
        now = time.time()

        with self._lock:
            # Check lockout first
            if ip in self._lockouts:
                lockout_until = self._lockouts[ip]
                if now < lockout_until:
                    remaining = int(lockout_until - now)
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
                    )
                else:
                    del self._lockouts[ip]

            if success:
                # Clear failure record on success
                self._attempts[ip] = []
                return

            # Prune attempts outside the window
            self._attempts[ip] = [
                t for t in self._attempts[ip] if now - t < self.window_seconds
            ]
            self._attempts[ip].append(now)

            if len(self._attempts[ip]) >= self.max_attempts:
                self._lockouts[ip] = now + self.lockout_seconds
                self._attempts[ip] = []
                raise HTTPException(
                    status_code=429,
                    detail={
                        "error": "too_many_attempts",
                        "message": (
                            f"Too many failed attempts. "
                            f"Locked out for {self.lockout_seconds // 3600} hour(s)."
                        ),
                        "retry_after": self.lockout_seconds,
                    },
                )


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