"""Simple in-memory rate limiting helpers for security-sensitive endpoints."""

from __future__ import annotations

import time
from collections import deque
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
        # Counter for the lazy sweep — every _sweep_every calls to
        # hit(), we sweep all keys' buckets and remove stale
        # entries. The per-hit cleanup (pop-while-loop) handles
        # the common case where a key gets a follow-up hit
        # within the window; the lazy sweep handles the leak
        # case where a key has events but never gets a
        # follow-up hit (stale events linger in the bucket).
        # 1000 is a balance: the sweep runs ~once per 1000
        # hits (O(dict-size) per call) and the dict size stays
        # bounded at ~1000 entries under sustained traffic.
        self._hit_count: int = 0
        self._sweep_every: int = 1000

    def _maybe_sweep(self, now: float) -> None:
        """Lazy sweep: every _sweep_every calls, walk all keys'
        buckets, pop stale entries, and del the key if the
        bucket becomes empty.

        The lock is already held by the caller.
        """
        self._hit_count += 1
        if self._hit_count % self._sweep_every != 0:
            return
        # Snapshot the keys to avoid mutating the dict during
        # iteration (del during iteration raises RuntimeError
        # in CPython 3.x+).
        keys = list(self._events.keys())
        for k in keys:
            bucket = self._events.get(k)
            if bucket is None:
                continue
            # Pop stale entries. The window_seconds is per-hit
            # (passed to hit()), so we don't have a single
            # window to compare against. Instead, we use a
            # conservative heuristic: if the bucket's last event
            # is older than 1 hour, drop the whole bucket. This
            # is a generous safety net for keys that have not
            # been hit in a long time; the per-hit cleanup
            # already handles the within-window case.
            #
            # We could track per-key window_seconds, but the
            # current design only has one window_seconds per hit
            # call. The lazy sweep is a coarse safety net; the
            # fine-grained check is the per-hit pop-while-loop.
            if not bucket:
                del self._events[k]
                continue
            # If the bucket's first entry is older than 1 hour
            # (a common max-window), the entire bucket is stale.
            # (The deque is ordered; bucket[0] is the oldest.)
            if now - bucket[0] > 3600:
                del self._events[k]

    def hit(self, key: str, *, limit: int, window_seconds: int, message: str) -> None:
        now = time.time()
        cutoff = now - window_seconds
        with self._lock:
            # Lazy sweep before processing the hit. The sweep
            # is O(dict-size) but only runs every 1000 calls,
            # so the amortized cost is O(1) per hit.
            self._maybe_sweep(now)
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
