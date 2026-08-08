"""Unit tests for arena.core.response_cache."""

import pytest

from arena.core.response_cache import ResponseCache, all_responses_healthy, make_cache_key


def _agent(verdict="Real answer", one_liner="Short answer", confidence=70):
    from arena.models.schemas import AgentResponse

    return AgentResponse(
        agent_id="agent_1",
        agent_number=1,
        verdict=verdict,
        one_liner=one_liner,
        confidence=confidence,
        key_assumption="assumption",
    )


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


class TestAllResponsesHealthy:
    def test_healthy_round(self):
        assert all_responses_healthy([_agent() for _ in range(4)]) is True

    def test_empty_round_is_not_healthy(self):
        assert all_responses_healthy([]) is False

    def test_single_error_slot_blocks_caching(self):
        responses = [_agent() for _ in range(3)] + [
            _agent(
                verdict="[Error: provider down]",
                one_liner="Response unavailable",
                confidence=0,
            )
        ]
        assert all_responses_healthy(responses) is False

    def test_all_error_round_is_not_healthy(self):
        responses = [
            _agent(
                verdict="[Error: request timed out]",
                one_liner="Response unavailable",
                confidence=0,
            )
            for _ in range(4)
        ]
        assert all_responses_healthy(responses) is False
