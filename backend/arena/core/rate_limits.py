"""Simple in-memory rate limiting helpers for security-sensitive endpoints."""

from __future__ import annotations

import time
from collections import defaultdict, deque
from threading import Lock

from fastapi import HTTPException, Request, status


class InMemoryRateLimiter:
    def __init__(self) -> None:
        # _events is keyed by "<scope>:<key>" (e.g. "ip:room_join:1.2.3.4"
        # or "user:agent_run:42"). A malicious actor with a large IP
        # pool could create unbounded keys; we use a plain dict and
        # del the entry when the bucket becomes empty in hit(),
        # so a key's lifetime is bounded by window_seconds after
        # its last event. The previous default-dict would leave an
        # empty deque for every new key ever seen (memory leak).
        self._events: dict[str, deque[float]] = {}
        self._lock = Lock()

    def hit(self, key: str, *, limit: int, window_seconds: int, message: str) -> None:
        now = time.time()
        cutoff = now - window_seconds
        with self._lock:
            bucket = self._events.get(key)
            if bucket is None:
                bucket = deque()
                self._events[key] = bucket
            # Pop entries older than the window. If the bucket
            # becomes empty (e.g. the previous event is older than
            # the window) AND the current hit is rate-limited, we
            # would otherwise leave the empty bucket in the dict
            # forever. Detect this and clean up below.
            while bucket and bucket[0] <= cutoff:
                bucket.popleft()
            if len(bucket) >= limit:
                retry_after = max(1, int(window_seconds - (now - bucket[0])))
                # Header + body: well-behaved clients (fetch wrappers, SDKs)
                # read Retry-After; our JSON detail still carries retry_after
                # for UI that only inspects the response body.
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail={
                        "error": "rate_limit_exceeded",
                        "message": message,
                        "retry_after": retry_after,
                    },
                    headers={"Retry-After": str(retry_after)},
                )
            bucket.append(now)


rate_limiter = InMemoryRateLimiter()


def client_ip(request: Request) -> str:
    # Shared extractor: never trust leftmost X-Forwarded-For (spoofable).
    from arena.core.client_ip import get_request_client_ip

    return get_request_client_ip(request)


def enforce_ip_rate_limit(
    request: Request,
    *,
    scope: str,
    limit: int,
    window_seconds: int,
    message: str,
) -> None:
    rate_limiter.hit(
        f"ip:{scope}:{client_ip(request)}",
        limit=limit,
        window_seconds=window_seconds,
        message=message,
    )


def enforce_user_rate_limit(
    user_id: int,
    *,
    scope: str,
    limit: int,
    window_seconds: int,
    message: str,
) -> None:
    rate_limiter.hit(
        f"user:{scope}:{user_id}",
        limit=limit,
        window_seconds=window_seconds,
        message=message,
    )
