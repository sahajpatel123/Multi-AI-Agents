"""Integration tests for the in-process response cache on POST /api/prompt.

The cache short-circuits the four-model fan-out for identical stateless
requests (same prompt + persona panel, no session_id, no context, no
personalized memory). Downstream integrity / scoring / memory / usage still
run live on a hit, so the tests below assert orchestrator call counts and
cache-eligibility guards rather than re-implementing the pipeline.
"""

from __future__ import annotations

import pytest

from arena.core.response_cache import get_cache
from arena.core.tools.base import ToolResult


def _canned_responses(prompt: str):
    from arena.models.schemas import AgentResponse

    return [
        AgentResponse(
            agent_id=f"agent_{i}",
            agent_number=i,
            verdict=f"Canned verdict {i} for {prompt}",
            one_liner=f"Short answer {i}",
            confidence=60 + i,
            key_assumption=f"Assumption {i}",
        )
        for i in range(1, 5)
    ]


@pytest.fixture(autouse=True)
def _isolated_response_cache():
    """The cache singleton is process-global; reset it around every test."""
    get_cache().reset()
    yield
    get_cache().reset()


def _patch_orchestrator(monkeypatch, calls: dict, tools_used=None):
    from arena.core.orchestrator import Orchestrator

    async def fake_run_all_agents(self, prompt, agents=None, **kwargs):
        calls["n"] += 1
        return _canned_responses(prompt), list(tools_used or [])

    monkeypatch.setattr(Orchestrator, "run_all_agents", fake_run_all_agents)


class TestPromptResponseCache:
    @pytest.mark.asyncio
    async def test_identical_stateless_prompt_hits_cache(
        self, app_client, auth_headers, stub_anthropic, monkeypatch
    ):
        """Two identical stateless requests run the agent fan-out once."""
        calls = {"n": 0}
        _patch_orchestrator(monkeypatch, calls)
        headers = auth_headers()

        # Must not trigger live tools — web_search fires on "what is".
        body = {"prompt": "Explain how photosynthesis works"}
        first = await app_client.post("/api/prompt", json=body, headers=headers)
        second = await app_client.post("/api/prompt", json=body, headers=headers)

        assert first.status_code == 200
        assert second.status_code == 200
        assert calls["n"] == 1

        first_data = first.json()
        second_data = second.json()
        assert first_data["winner"]["agent_id"] == second_data["winner"]["agent_id"]
        assert first_data["all_responses"] == second_data["all_responses"]

    @pytest.mark.asyncio
    async def test_session_id_disables_cache(
        self, app_client, auth_headers, stub_anthropic, monkeypatch
    ):
        """Continuation prompts (session_id set) never short-circuit."""
        calls = {"n": 0}
        _patch_orchestrator(monkeypatch, calls)
        headers = auth_headers()

        body = {"prompt": "Same follow-up", "session_id": "sess-cache-test"}
        first = await app_client.post("/api/prompt", json=body, headers=headers)
        second = await app_client.post("/api/prompt", json=body, headers=headers)

        assert first.status_code == 200
        assert second.status_code == 200
        assert calls["n"] == 2

    @pytest.mark.asyncio
    async def test_tool_using_round_is_not_cached(
        self, app_client, auth_headers, stub_anthropic, monkeypatch
    ):
        """Rounds that used live tools are never stored, so they re-run."""
        calls = {"n": 0}
        _patch_orchestrator(monkeypatch, calls, tools_used=["web_search"])
        headers = auth_headers()

        body = {"prompt": "What is the latest news?"}
        first = await app_client.post("/api/prompt", json=body, headers=headers)
        second = await app_client.post("/api/prompt", json=body, headers=headers)

        assert first.status_code == 200
        assert second.status_code == 200
        assert calls["n"] == 2

    @pytest.mark.asyncio
    async def test_cache_hit_rechecks_tool_triggers(
        self, app_client, auth_headers, stub_anthropic, monkeypatch
    ):
        """A cached round is not served once the prompt starts needing tools."""
        calls = {"n": 0}
        _patch_orchestrator(monkeypatch, calls)
        headers = auth_headers()
        body = {"prompt": "Tell me about black holes"}

        first = await app_client.post("/api/prompt", json=body, headers=headers)
        assert first.status_code == 200
        assert calls["n"] == 1

        from arena.core.tools.tool_router import ToolRouter

        async def fake_tools(self, prompt, **kwargs):
            return {
                "web_search": ToolResult(
                    tool_name="web_search",
                    success=True,
                    data={"query": prompt, "results": []},
                )
            }

        monkeypatch.setattr(ToolRouter, "execute_tools", fake_tools)

        second = await app_client.post("/api/prompt", json=body, headers=headers)
        assert second.status_code == 200
        # Stale cache entry existed but the tool re-check rejected it.
        assert calls["n"] == 2

    @pytest.mark.asyncio
    async def test_memory_enabled_tier_never_cached(
        self, app_client, make_user, stub_anthropic, monkeypatch
    ):
        """Plus-tier personalized memory rounds must always run live."""
        from arena.core.auth import create_access_token
        from arena.db_models import UserTier

        user = make_user(email="cache-plus@test.com", tier=UserTier.PLUS)
        headers = {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}

        calls = {"n": 0}
        _patch_orchestrator(monkeypatch, calls)

        body = {"prompt": "Personalized question"}
        first = await app_client.post("/api/prompt", json=body, headers=headers)
        second = await app_client.post("/api/prompt", json=body, headers=headers)

        assert first.status_code == 200
        assert second.status_code == 200
        assert calls["n"] == 2

    @pytest.mark.asyncio
    async def test_all_error_round_is_not_cached(
        self, app_client, auth_headers, stub_anthropic, monkeypatch
    ):
        """Rounds where every agent errored are never stored as cache entries."""
        from arena.core.orchestrator import Orchestrator
        from arena.models.schemas import AgentResponse

        calls = {"n": 0}

        async def fake_error_run(self, prompt, agents=None, **kwargs):
            calls["n"] += 1
            return [
                AgentResponse(
                    agent_id=f"agent_{i}",
                    agent_number=i,
                    verdict="[Error: provider down]",
                    one_liner="Response unavailable",
                    confidence=0,
                    key_assumption="N/A",
                )
                for i in range(1, 5)
            ], []

        monkeypatch.setattr(Orchestrator, "run_all_agents", fake_error_run)
        headers = auth_headers()
        body = {"prompt": "Explain how photosynthesis works"}

        first = await app_client.post("/api/prompt", json=body, headers=headers)
        second = await app_client.post("/api/prompt", json=body, headers=headers)

        assert first.status_code == 200
        assert second.status_code == 200
        assert calls["n"] == 2

    @pytest.mark.asyncio
    async def test_health_exposes_cache_stats(
        self, app_client, auth_headers, stub_anthropic, monkeypatch
    ):
        """The liveness probe reports cache hit/miss counters."""
        calls = {"n": 0}
        _patch_orchestrator(monkeypatch, calls)
        headers = auth_headers()
        body = {"prompt": "Cache stats probe"}

        first = await app_client.post("/api/prompt", json=body, headers=headers)
        second = await app_client.post("/api/prompt", json=body, headers=headers)
        assert first.status_code == 200
        assert second.status_code == 200

        res = await app_client.get("/api/prompt/health")
        assert res.status_code == 200
        stats = res.json()["response_cache"]
        assert stats["hits"] >= 1
        assert stats["misses"] >= 1
        assert stats["size"] >= 1

    @pytest.mark.asyncio
    async def test_cache_hit_with_live_tool_reuses_tool_results(
        self, app_client, auth_headers, stub_anthropic, monkeypatch
    ):
        """A hit candidate that now needs tools reuses the pre-check results
        instead of executing the tool twice for one request."""
        from arena.core.orchestrator import Orchestrator
        from arena.core.tools.tool_router import ToolRouter

        calls = {"n": 0}
        received: dict = {}

        async def fake_run_all_agents(self, prompt, agents=None, **kwargs):
            calls["n"] += 1
            received["tool_results"] = kwargs.get("tool_results")
            return _canned_responses(prompt), []

        monkeypatch.setattr(Orchestrator, "run_all_agents", fake_run_all_agents)
        headers = auth_headers()
        body = {"prompt": "Tell me about black holes"}

        first = await app_client.post("/api/prompt", json=body, headers=headers)
        assert first.status_code == 200
        assert calls["n"] == 1
        assert received["tool_results"] is None

        tool_calls = {"n": 0}

        async def fake_tools(self, prompt, **kwargs):
            tool_calls["n"] += 1
            return {
                "web_search": ToolResult(
                    tool_name="web_search",
                    success=True,
                    data={"query": prompt, "results": []},
                )
            }

        monkeypatch.setattr(ToolRouter, "execute_tools", fake_tools)

        second = await app_client.post("/api/prompt", json=body, headers=headers)
        assert second.status_code == 200
        # Stale cache entry rejected, orchestrator re-runs...
        assert calls["n"] == 2
        # ...but the tool router ran once, and its results were handed over.
        assert tool_calls["n"] == 1
        assert "web_search" in received["tool_results"]
