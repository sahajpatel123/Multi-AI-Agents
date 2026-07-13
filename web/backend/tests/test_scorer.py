"""Unit tests for arena.core.scorer.

Uses a stub Claude client so we can drive the scoring flow without external calls.
"""

import json

import pytest

from arena.core.scorer import Scorer
from arena.models.schemas import AgentResponse, AgentConfig, IntegrityReport


def _make_agent(agent_id: str = "agent_1", persona_id: str = "analyst") -> AgentConfig:
    return AgentConfig(
        agent_id=agent_id,
        agent_number=int(agent_id.split("_")[1]),
        persona_id=persona_id,
        name="Analyst",
        color="#888888",
        temperature=0.5,
        system_prompt="test prompt",
    )


def _make_response(agent_id: str = "agent_1") -> AgentResponse:
    return AgentResponse(
        agent_id=agent_id,
        agent_number=int(agent_id.split("_")[1]),
        verdict="x" * 200,
        one_liner=f"summary from {agent_id}",
        confidence=80,
        key_assumption="test",
    )


class TestScorerFormat:
    def setup_method(self):
        self.scorer = Scorer()

    def test_format_includes_all_responses(self):
        responses = [_make_response("agent_1"), _make_response("agent_2")]
        text = self.scorer._format_responses_for_scoring("hello", responses)
        assert "USER'S ORIGINAL PROMPT" in text
        assert "AGENT_1" in text
        assert "AGENT_2" in text
        assert "AGENT RESPONSES" in text

    def test_format_includes_integrity_flags(self):
        responses = [_make_response()]
        report = IntegrityReport(flags=["agent_2 drifted on length"])
        text = self.scorer._format_responses_for_scoring("hello", responses, integrity=report)
        assert "INTEGRITY WARNINGS" in text
        assert "agent_2 drifted" in text

    def test_format_skips_integrity_when_empty(self):
        responses = [_make_response()]
        text = self.scorer._format_responses_for_scoring("hi", responses, IntegrityReport())
        assert "INTEGRITY WARNINGS" not in text


class TestScorerGetWinner:
    def test_returns_marked_winner(self):
        winner_resp = _make_response("agent_1")
        loser_resp = _make_response("agent_2")
        from arena.models.schemas import ScoredAgent

        scored = [
            ScoredAgent(response=winner_resp, score=95, is_winner=True),
            ScoredAgent(response=loser_resp, score=70, is_winner=False),
        ]
        s = Scorer()
        winner = s.get_winner(scored)
        assert winner is winner_resp

    def test_falls_back_to_highest_score(self):
        from arena.models.schemas import ScoredAgent

        scored = [
            ScoredAgent(response=_make_response("agent_1"), score=60, is_winner=False),
            ScoredAgent(response=_make_response("agent_2"), score=90, is_winner=False),
        ]
        winner = Scorer().get_winner(scored)
        assert winner.response.agent_id == "agent_2"

    def test_returns_none_for_empty(self):
        assert Scorer().get_winner([]) is None


class TestScorerScoringHappyPath:
    @pytest.mark.asyncio
    async def test_parses_clean_json(self, stub_anthropic):
        stub_anthropic.response_text = json.dumps({
            "scores": {"agent_1": 90, "agent_2": 70, "agent_3": 60, "agent_4": 50},
            "winner": "agent_1",
            "reasoning": "best",
        })
        # Swap in the stub client used by scorer
        from arena.core import model_router
        model_router.claude_client = stub_anthropic

        scorer = Scorer()
        responses = [_make_response(f"agent_{i}") for i in range(1, 5)]
        scored = await scorer.score_responses("prompt", responses)
        assert len(scored) == 4
        winner = scorer.get_winner(scored)
        assert winner.response.agent_id == "agent_1"

    @pytest.mark.asyncio
    async def test_strips_markdown_fences(self, stub_anthropic):
        stub_anthropic.response_text = (
            "```json\n"
            + json.dumps({"scores": {"agent_1": 80}, "winner": "agent_1"})
            + "\n```"
        )
        from arena.core import model_router
        model_router.claude_client = stub_anthropic

        scorer = Scorer()
        responses = [_make_response("agent_1")]
        scored = await scorer.score_responses("p", responses)
        assert scored[0].score == 80

    @pytest.mark.asyncio
    async def test_fallback_on_parse_error(self, stub_anthropic):
        stub_anthropic.response_text = "not json at all"
        from arena.core import model_router
        model_router.claude_client = stub_anthropic

        scorer = Scorer()
        responses = [_make_response("agent_1")]
        scored = await scorer.score_responses("p", responses)
        # Falls back to score=50, is_winner=True for the first response
        assert scored[0].score == 50
        assert scored[0].is_winner is True