"""Unit tests for arena.core.response_cache."""

import pytest

from arena.core.response_cache import ResponseCache, make_cache_key


class TestMakeCacheKey:
    def test_same_inputs_same_key(self):
        a = make_cache_key("What is X?", ["analyst", "philosopher", "pragmatist", "contrarian"])
        b = make_cache_key("What is X?", ["analyst", "philosopher", "pragmatist", "contrarian"])
        assert a == b

    def test_normalizes_whitespace(self):
        a = make_cache_key("What  is  X?", ["analyst"])
        b = make_cache_key("what is x?", ["analyst"])
        assert a == b

    def test_different_prompt_different_key(self):
        a = make_cache_key("What is X?", ["analyst"])
        b = make_cache_key("What is Y?", ["analyst"])
        assert a != b

    def test_different_persona_different_key(self):
        a = make_cache_key("Hi", ["analyst", "philosopher", "pragmatist", "contrarian"])
        b = make_cache_key("Hi", ["scientist", "historian", "economist", "ethicist"])
        assert a != b

    def test_persona_order_matters(self):
        a = make_cache_key("Hi", ["analyst", "philosopher", "pragmatist", "contrarian"])
        b = make_cache_key("Hi", ["philosopher", "analyst", "pragmatist", "contrarian"])
        # Different order = different routing = different key.
        assert a != b

    def test_expertise_changes_key(self):
        a = make_cache_key("Hi", ["analyst"], expertise_level="curious")
        b = make_cache_key("Hi", ["analyst"], expertise_level="expert")
        assert a != b


class TestResponseCache:
    def test_miss_returns_none(self):
        cache = ResponseCache()
        assert cache.get("absent") is None
        s = cache.stats()
        assert s["misses"] == 1
        assert s["hits"] == 0

    def test_set_then_get(self):
        cache = ResponseCache()
        cache.set("k", {"winner": "analyst", "score": 90})
        assert cache.get("k") == {"winner": "analyst", "score": 90}
        s = cache.stats()
        assert s["hits"] == 1
        assert s["misses"] == 0

    def test_overwrite_same_key(self):
        cache = ResponseCache()
        cache.set("k", "first")
        cache.set("k", "second")
        assert cache.get("k") == "second"
        assert cache.stats()["size"] == 1

    def test_lru_eviction(self):
        cache = ResponseCache(max_entries=2)
        cache.set("a", 1)
        cache.set("b", 2)
        cache.get("a")  # touches "a"
        cache.set("c", 3)  # evicts "b" (oldest untouched)
        assert cache.get("a") == 1
        assert cache.get("b") is None
        assert cache.get("c") == 3
        assert cache.stats()["evictions"] == 1

    def test_ttl_expiry(self, monkeypatch):
        cache = ResponseCache(ttl_seconds=10)
        cache.set("k", "value")
        # Advance internal clock by manipulating the entry directly.
        entry = cache._store["k"]
        entry.expires_at -= 20  # backdate so it's already expired
        assert cache.get("k") is None

    def test_disabled_env_var(self, monkeypatch):
        monkeypatch.setenv("ARENA_CACHE_DISABLED", "1")
        cache = ResponseCache()
        cache.set("k", "value")
        assert cache.get("k") is None

    def test_clear(self):
        cache = ResponseCache()
        cache.set("a", 1)
        cache.set("b", 2)
        cache.clear()
        assert cache.get("a") is None
        assert cache.get("b") is None
        assert cache.stats()["size"] == 0

    def test_hit_rate(self):
        cache = ResponseCache()
        cache.set("k", "v")
        cache.get("k")  # hit
        cache.get("k")  # hit
        cache.get("missing")  # miss
        s = cache.stats()
        assert s["hits"] == 2
        assert s["misses"] == 1
        assert abs(s["hit_rate"] - 2/3) < 0.001


class TestGetCacheSingleton:
    def test_returns_same_instance(self):
        from arena.core.response_cache import get_cache
        a = get_cache()
        b = get_cache()
        assert a is b