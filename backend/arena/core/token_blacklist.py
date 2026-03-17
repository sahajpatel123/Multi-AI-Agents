"""In-memory token blacklist for revoked JWTs (e.g. after logout)."""

from threading import Lock


class TokenBlacklist:
    """
    Thread-safe in-memory set of revoked JWT tokens.

    Note: this is reset on server restart. For multi-process/multi-server
    deployments, replace with a shared store (Redis, DB, etc.).
    """

    def __init__(self) -> None:
        self._blacklist: set[str] = set()
        self._lock = Lock()

    def add(self, token: str) -> None:
        """Revoke a token."""
        with self._lock:
            self._blacklist.add(token)

    def is_blacklisted(self, token: str) -> bool:
        """Return True if the token has been revoked."""
        with self._lock:
            return token in self._blacklist

    def clear(self) -> None:
        """Remove all entries (e.g. during testing or periodic cleanup)."""
        with self._lock:
            self._blacklist.clear()


# Singleton instance used across the app
token_blacklist = TokenBlacklist()