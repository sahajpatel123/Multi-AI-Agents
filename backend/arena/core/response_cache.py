"""In-process LRU response cache for Arena prompt results.

Why this exists:
- The same question asked twice in a row (typo fix, double-click) was burning
  4 LLM calls each time. Caching identical prompts with identical persona
  panels cuts that to zero on hit.
- Tool results, memory, and persona drift checks still run live (they're not
  cached), but the model fan-out is short-circuited.

Key design choices:
- Pure-Python LRU with O(1) get/set, no Redis dependency.
- TTL = 1 hour by default; oldest entry evicted first.
- Key = sha256(normalized_prompt + sorted persona_ids + expertise_level).
  Persona ORDER matters for routing (each slot maps to a specific model), so
  we preserve order when hashing.
- Disabled when session_id is present (continuation/conversation prompts
  shouldn't hit cache because the conversation context matters).
- Bypassed in test environments via env var ARENA_CACHE_DISABLED=1.

The cache is process-local. A multi-worker deployment will have N independent
caches; that's fine because each prompt still costs the same on a miss.
"""

from __future__ import annotations

import hashlib
import os
import re
import threading
import time
from collections import OrderedDict
from typing import Any, Optional


_DEFAULT_TTL_SECONDS = 3600  # 1 hour
_DEFAULT_MAX_ENTRIES = 256
_WHITESPACE_RE = re.compile(r"\s+")


def _normalize_prompt(prompt: str) -> str:
    return _WHITESPACE_RE.sub(" ", prompt.strip().lower())


def make_cache_key(
    prompt: str,
    persona_ids: list[str],
    expertise_level: str = "",
) -> str:
    """Stable cache key for a (prompt, panel) tuple."""
    norm = _normalize_prompt(prompt)
    # Sort for persona identity but keep order to preserve routing.
    persona_tuple = tuple(persona_ids or [])
    raw = f"{norm}\x00{','.join(persona_tuple)}\x00{expertise_level}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


class _CacheEntry:
    __slots__ = ("value", "expires_at", "stored_at")

    def __init__(self, value: Any, expires_at: float):
        self.value = value
        self.expires_at = expires_at
        self.stored_at = time.monotonic()

    def is_expired(self, now: float) -> bool:
        return now >= self.expires_at


class ResponseCache:
    """Thread-safe LRU cache for prompt-response tuples."""

    def __init__(self, max_entries: int = _DEFAULT_MAX_ENTRIES, ttl_seconds: int = _DEFAULT_TTL_SECONDS):
        self._store: OrderedDict[str, _CacheEntry] = OrderedDict()
        self._lock = threading.Lock()
        self._max_entries = max_entries
        self._ttl_seconds = ttl_seconds
        self._disabled = os.environ.get("ARENA_CACHE_DISABLED", "").lower() in ("1", "true", "yes")
        self._hits = 0
        self._misses = 0
        self._evictions = 0

    def get(self, key: str) -> Optional[Any]:
        if self._disabled:
            return None
        now = time.monotonic()
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                self._misses += 1
                return None
            if entry.is_expired(now):
                del self._store[key]
                self._misses += 1
                return None
            # LRU touch — move to end.
            self._store.move_to_end(key)
            self._hits += 1
            return entry.value

    def set(self, key: str, value: Any) -> None:
        if self._disabled:
            return
        now = time.monotonic()
        expires_at = now + self._ttl_seconds
        with self._lock:
            if key in self._store:
                self._store.move_to_end(key)
                self._store[key].value = value
                self._store[key].expires_at = expires_at
                self._store[key].stored_at = now
                return
            self._store[key] = _CacheEntry(value, expires_at)
            while len(self._store) > self._max_entries:
                self._store.popitem(last=False)
                self._evictions += 1

    def clear(self) -> None:
        with self._lock:
            self._store.clear()

    def stats(self) -> dict:
        with self._lock:
            total = self._hits + self._misses
            hit_rate = (self._hits / total) if total else 0.0
            return {
                "size": len(self._store),
                "max_size": self._max_entries,
                "hits": self._hits,
                "misses": self._misses,
                "evictions": self._evictions,
                "hit_rate": round(hit_rate, 4),
                "disabled": self._disabled,
            }


_cache: ResponseCache | None = None
_cache_lock = threading.Lock()


def get_cache() -> ResponseCache:
    """Process-local singleton cache."""
    global _cache
    if _cache is None:
        with _cache_lock:
            if _cache is None:
                _cache = ResponseCache()
    return _cache