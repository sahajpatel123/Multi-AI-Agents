"""Integration tests for the streaming discuss endpoint (POST /api/discuss/stream)."""

import pytest
import json


class TestDiscussStreamingEndpoint:
    """Tests for POST /api/discuss/stream SSE endpoint."""

    @pytest.mark.asyncio
    async def test_stream_discuss_returns_sse_events(
        self, app_client, auth_headers, make_user, stub_anthropic
    ):
        """Streaming discuss emits token and result events."""
        from arena.db_models import UserTier
        user = make_user(
            email="discuss@test.com",
            tier=UserTier.PLUS,
        )
        from arena.core.auth import create_access_token
        headers = {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}

        res = await app_client.post(
            "/api/discuss/stream",
            json={
                "agent_id": "agent_1",
                "original_prompt": "What is the meaning of life?",
                "original_verdict": "42, according to Douglas Adams.",
                "message": "Can you elaborate?",
                "session_id": "test-discuss-session",
                "persona_ids": ["analyst", "philosopher", "pragmatist", "contrarian"],
            },
            headers=headers,
        )

        assert res.status_code == 200
        assert "text/event-stream" in res.headers.get("content-type", "")

        events = self._parse_sse_events(res.text)
        event_types = [e["event"] for e in events]

        # Should have token events (streaming)
        token_events = [e for e in events if e["event"] == "token"]
        assert len(token_events) > 0

        # Should have final result
        result_events = [e for e in events if e["event"] == "result"]
        assert len(result_events) == 1

        result = result_events[0]["data"]
        assert "agent_id" in result
        assert "content" in result
        assert "conversation_history" in result
        assert "session_id" in result

        # Conversation history should include user message and agent reply
        history = result["conversation_history"]
        assert len(history) == 2
        assert history[0]["role"] == "user"
        assert history[1]["role"] == "agent"

    @pytest.mark.asyncio
    async def test_stream_discuss_free_tier_rejected(
        self, app_client, auth_headers, make_user, stub_anthropic
    ):
        """FREE tier user cannot access discuss streaming endpoint."""
        from arena.db_models import UserTier
        user = make_user(email="freediscuss@test.com", tier=UserTier.FREE)
        from arena.core.auth import create_access_token
        headers = {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}

        res = await app_client.post(
            "/api/discuss/stream",
            json={
                "agent_id": "agent_1",
                "original_prompt": "Test",
                "original_verdict": "Test",
                "message": "Test message",
            },
            headers=headers,
        )

        assert res.status_code == 403
        body = res.json()
        # HTTPException.detail contains the error dict
        assert body.get("detail", {}).get("error") == "feature_not_allowed"
        assert "Plus" in body.get("detail", {}).get("message", "")

    @pytest.mark.asyncio
    async def test_stream_discuss_invalid_agent_id(
        self, app_client, auth_headers, make_user, stub_anthropic
    ):
        """Invalid agent_id returns 400."""
        from arena.db_models import UserTier
        user = make_user(email="discuss2@test.com", tier=UserTier.PLUS)
        from arena.core.auth import create_access_token
        headers = {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}

        res = await app_client.post(
            "/api/discuss/stream",
            json={
                "agent_id": "invalid_agent",
                "original_prompt": "Test",
                "original_verdict": "Test",
                "message": "Test",
            },
            headers=headers,
        )

        assert res.status_code == 400

    @pytest.mark.asyncio
    async def test_stream_discuss_conversation_history_preserved(
        self, app_client, auth_headers, make_user, stub_anthropic
    ):
        """Conversation history is maintained across calls."""
        from arena.db_models import UserTier
        user = make_user(email="discuss3@test.com", tier=UserTier.PLUS)
        from arena.core.auth import create_access_token
        headers = {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}

        # First message
        res1 = await app_client.post(
            "/api/discuss/stream",
            json={
                "agent_id": "agent_1",
                "original_prompt": "Test prompt",
                "original_verdict": "Initial verdict",
                "message": "First question",
                "session_id": "history-test",
            },
            headers=headers,
        )
        events1 = self._parse_sse_events(res1.text)
        result1 = [e for e in events1 if e["event"] == "result"][0]["data"]

        # Second message with history from first
        res2 = await app_client.post(
            "/api/discuss/stream",
            json={
                "agent_id": "agent_1",
                "original_prompt": "Test prompt",
                "original_verdict": "Initial verdict",
                "message": "Follow-up question",
                "session_id": "history-test",
                "conversation_history": result1["conversation_history"],
            },
            headers=headers,
        )
        events2 = self._parse_sse_events(res2.text)
        result2 = [e for e in events2 if e["event"] == "result"][0]["data"]

        # History should have 4 entries now (user, agent, user, agent)
        assert len(result2["conversation_history"]) == 4

    @pytest.mark.asyncio
    async def test_stream_discuss_unauthenticated_rejected(self, app_client):
        """Unauthenticated discuss stream requests return 401."""
        res = await app_client.post(
            "/api/discuss/stream",
            json={
                "agent_id": "agent_1",
                "original_prompt": "Test",
                "original_verdict": "Test",
                "message": "Test",
            },
        )
        assert res.status_code == 401

    @pytest.mark.asyncio
    async def test_stream_discuss_with_conversation_history(
        self, app_client, auth_headers, make_user, stub_anthropic
    ):
        """Pre-existing conversation history is used correctly."""
        from arena.db_models import UserTier
        user = make_user(email="discuss4@test.com", tier=UserTier.PLUS)
        from arena.core.auth import create_access_token
        headers = {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}

        pre_history = [
            {"role": "user", "content": "Previous question"},
            {"role": "agent", "content": "Previous answer"},
        ]

        res = await app_client.post(
            "/api/discuss/stream",
            json={
                "agent_id": "agent_1",
                "original_prompt": "Original question",
                "original_verdict": "Original answer",
                "message": "New question with context",
                "conversation_history": pre_history,
            },
            headers=headers,
        )

        assert res.status_code == 200
        events = self._parse_sse_events(res.text)
        result = [e for e in events if e["event"] == "result"][0]["data"]

        # History should include pre-history + new exchange
        assert len(result["conversation_history"]) == 4

    @pytest.mark.asyncio
    async def test_stream_discuss_result_structure_matches_schema(
        self, app_client, auth_headers, make_user, stub_anthropic
    ):
        """Result event matches DiscussResponse schema."""
        from arena.db_models import UserTier
        user = make_user(email="discuss5@test.com", tier=UserTier.PLUS)
        from arena.core.auth import create_access_token
        headers = {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}

        res = await app_client.post(
            "/api/discuss/stream",
            json={
                "agent_id": "agent_1",
                "original_prompt": "Test",
                "original_verdict": "Test",
                "message": "Test message",
            },
            headers=headers,
        )

        events = self._parse_sse_events(res.text)
        result = [e for e in events if e["event"] == "result"][0]["data"]

        # Verify required fields
        assert "agent_id" in result
        assert isinstance(result["agent_id"], str)
        assert "content" in result
        assert isinstance(result["content"], str)
        assert "conversation_history" in result
        assert isinstance(result["conversation_history"], list)
        assert "session_id" in result
        assert isinstance(result["session_id"], str)

    def _parse_sse_events(self, text: str) -> list[dict]:
        """Parse SSE event stream into list of {event, data} dicts."""
        events = []
        current_event = None
        current_data = []

        for line in text.splitlines():
            if line.startswith("event:"):
                if current_event is not None:
                    events.append({
                        "event": current_event,
                        "data": json.loads("\n".join(current_data)) if current_data else {}
                    })
                current_event = line[6:].strip()
                current_data = []
            elif line.startswith("data:"):
                current_data.append(line[5:].strip())
            elif line == "" and current_event is not None:
                events.append({
                    "event": current_event,
                    "data": json.loads("\n".join(current_data)) if current_data else {}
                })
                current_event = None
                current_data = []

        if current_event is not None:
            events.append({
                "event": current_event,
                "data": json.loads("\n".join(current_data)) if current_data else {}
            })

        return events