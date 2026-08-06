"""Tests for follow-up rounds — prior-round context on /api/prompt paths.

A follow-up round sends the previous prompt + answers as ``context`` so all
four personas answer the new question with continuity. The context must be
validated at parse time, formatted into a compact transcript, and injected
into every persona's system prompt without changing the response contract.
"""

from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from arena.core.followup import (
    FOLLOW_UP_HEADER,
    FOLLOW_UP_MAX_ITEM_CHARS,
    FOLLOW_UP_MAX_TOTAL_CHARS,
    format_follow_up_context,
)
from arena.models.schemas import PromptContextItem, PromptRequest


def _system_text(call: dict) -> str:
    blocks = call.get("system") or []
    return " ".join(
        block.get("text", "")
        for block in blocks
        if isinstance(block, dict)
    )


class TestFormatFollowUpContext:
    def test_returns_none_for_empty_input(self):
        assert format_follow_up_context(None) is None
        assert format_follow_up_context([]) is None

    def test_formats_user_and_assistant_items(self):
        items = [
            PromptContextItem(role="user", content="What is UBI?"),
            PromptContextItem(
                role="assistant",
                agent_id="agent_1",
                name="The Analyst",
                content="A policy that pays citizens a regular sum.",
            ),
        ]
        out = format_follow_up_context(items)
        assert out is not None
        assert out.startswith(FOLLOW_UP_HEADER)
        assert "User: What is UBI?" in out
        assert "The Analyst (agent_1): A policy that pays citizens" in out

    def test_skips_blank_items(self):
        items = [
            SimpleNamespace(role="user", content="   "),
            SimpleNamespace(role="assistant", agent_id="agent_2", content="ok"),
        ]
        out = format_follow_up_context(items)
        assert out is not None
        assert "User" not in out
        assert "ok" in out

    def test_truncates_oversized_item_and_total_budget(self):
        long_content = "x" * (FOLLOW_UP_MAX_ITEM_CHARS + 500)
        items = [
            SimpleNamespace(role="user", content="start"),
            SimpleNamespace(role="assistant", agent_id="agent_1", content=long_content),
        ]
        out = format_follow_up_context(items)
        assert out is not None
        # Per-item cap is enforced defensively even without Pydantic.
        assert "x" * (FOLLOW_UP_MAX_ITEM_CHARS + 1) not in out

    def test_drops_tail_items_past_total_budget(self):
        items = [
            PromptContextItem(role="user", content="q"),
            PromptContextItem(
                role="assistant", agent_id="agent_1", content="y" * 1700
            ),
            PromptContextItem(
                role="assistant", agent_id="agent_2", content="y" * 1700
            ),
            PromptContextItem(
                role="assistant", agent_id="agent_3", content="y" * 1700
            ),
            PromptContextItem(
                role="assistant", agent_id="agent_4", content="y" * 1700
            ),
        ]
        out = format_follow_up_context(items)
        assert out is not None
        assert len(out) <= FOLLOW_UP_MAX_TOTAL_CHARS + len(FOLLOW_UP_HEADER) + 8


class TestPromptRequestContextValidation:
    def test_accepts_valid_context(self):
        req = PromptRequest(
            prompt="and what about the cost?",
            context=[
                PromptContextItem(role="user", content="What is UBI?"),
                PromptContextItem(
                    role="assistant", agent_id="agent_1", content="A policy."
                ),
            ],
        )
        assert len(req.context) == 2

    def test_rejects_oversized_item(self):
        with pytest.raises(ValueError):
            PromptRequest(
                prompt="x",
                context=[
                    PromptContextItem(
                        role="user", content="z" * (FOLLOW_UP_MAX_ITEM_CHARS + 1)
                    )
                ],
            )

    def test_rejects_too_many_items(self):
        items = [
            PromptContextItem(role="user", content="q"),
        ] * 9
        with pytest.raises(ValueError):
            PromptRequest(prompt="x", context=items)

    def test_rejects_total_budget_overflow(self):
        # Eight in-budget items that together blow the 12k total budget.
        with pytest.raises(ValueError):
            PromptRequest(
                prompt="x",
                context=[
                    PromptContextItem(role="user", content="a" * 1700),
                    PromptContextItem(
                        role="assistant", agent_id="agent_1", content="b" * 1700
                    ),
                    PromptContextItem(
                        role="assistant", agent_id="agent_2", content="c" * 1700
                    ),
                    PromptContextItem(
                        role="assistant", agent_id="agent_3", content="d" * 1700
                    ),
                    PromptContextItem(
                        role="assistant", agent_id="agent_4", content="e" * 1700
                    ),
                    PromptContextItem(
                        role="assistant", agent_id="agent_5", content="f" * 1700
                    ),
                    PromptContextItem(
                        role="assistant", agent_id="agent_6", content="g" * 1700
                    ),
                    PromptContextItem(
                        role="assistant", agent_id="agent_7", content="h" * 1700
                    ),
                ],
            )


class TestFollowUpApi:
    @pytest.mark.asyncio
    async def test_stream_accepts_context_and_injects_it(
        self, app_client, auth_headers, stub_anthropic
    ):
        stub_anthropic.response_text = json.dumps(
            {
                "verdict": "Here is the follow-up verdict.",
                "one_liner": "Follow-up answered.",
                "confidence": 60,
                "key_assumption": "Continuity helps.",
            }
        )
        res = await app_client.post(
            "/api/prompt/stream",
            json={
                "prompt": "Given what was said, what would you change?",
                "persona_ids": ["empath", "analyst", "philosopher", "pragmatist"],
                "context": [
                    {"role": "user", "content": "Original question."},
                    {
                        "role": "assistant",
                        "agent_id": "agent_1",
                        "name": "The Analyst",
                        "content": "Original verdict.",
                    },
                ],
            },
            headers=auth_headers(),
        )
        assert res.status_code == 200
        assert "result" in res.text
        # At least one Claude-backed persona received the previous round.
        assert any(
            FOLLOW_UP_HEADER in _system_text(call) and "Original question." in _system_text(call)
            for call in stub_anthropic.calls
        )

    @pytest.mark.asyncio
    async def test_non_streaming_injects_context(
        self, app_client, auth_headers, stub_anthropic
    ):
        stub_anthropic.response_text = json.dumps(
            {
                "verdict": "Follow-up verdict.",
                "one_liner": "Done.",
                "confidence": 55,
                "key_assumption": "Context used.",
            }
        )
        res = await app_client.post(
            "/api/prompt",
            json={
                "prompt": "Dig deeper on that.",
                "persona_ids": ["empath", "analyst", "philosopher", "pragmatist"],
                "context": [
                    {"role": "user", "content": "First question."},
                    {
                        "role": "assistant",
                        "agent_id": "agent_3",
                        "name": "The Critic",
                        "content": "First answer.",
                    },
                ],
            },
            headers=auth_headers(),
        )
        assert res.status_code == 200
        body = res.json()
        assert body["prompt"] == "Dig deeper on that."
        assert any(
            FOLLOW_UP_HEADER in _system_text(call) and "First question." in _system_text(call)
            for call in stub_anthropic.calls
        )

    @pytest.mark.asyncio
    async def test_context_validation_errors_are_422(
        self, app_client, auth_headers
    ):
        headers = auth_headers()
        too_many = [
            {"role": "user", "content": "q"},
        ] * 9
        res = await app_client.post(
            "/api/prompt", json={"prompt": "x", "context": too_many}, headers=headers
        )
        assert res.status_code == 422

        oversized = [
            {"role": "user", "content": "z" * (FOLLOW_UP_MAX_ITEM_CHARS + 1)},
        ]
        res = await app_client.post(
            "/api/prompt", json={"prompt": "x", "context": oversized}, headers=headers
        )
        assert res.status_code == 422
