"""Integration tests for the streaming debate endpoint (POST /api/debate/stream)."""

import pytest
import json


class TestDebateStreamingEndpoint:
    """Tests for POST /api/debate/stream SSE endpoint."""

    @pytest.mark.asyncio
    async def test_stream_debate_returns_sse_events(
        self, app_client, auth_headers, make_user, stub_anthropic
    ):
        """Streaming debate emits reaction_token, reaction_done, and result events."""
        # Create a PLUS user (required for debate feature)
        from arena.db_models import UserTier
        user = make_user(
            email="debate@test.com",
            tier=UserTier.PLUS,
        )
        from arena.core.auth import create_access_token
        headers = {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}

        # First, we need an arena session to challenge
        # We'll simulate by providing a session_id and challenged agent
        res = await app_client.post(
            "/api/debate/stream",
            json={
                "original_prompt": "What is the best programming language?",
                "challenged_agent_id": "agent_1",
                "challenged_verdict": "Python is the best because it's readable.",
                "round_number": 1,
                "session_id": "test-debate-session",
                "persona_ids": ["analyst", "philosopher", "pragmatist", "contrarian"],
            },
            headers=headers,
        )

        # Should return SSE stream
        assert res.status_code == 200
        assert "text/event-stream" in res.headers.get("content-type", "")

        events = self._parse_sse_events(res.text)
        event_types = [e["event"] for e in events]

        # Should have reaction_token events (streaming)
        token_events = [e for e in events if e["event"] == "reaction_token"]
        assert len(token_events) > 0

        # Should have reaction_done for 3 agents
        done_events = [e for e in events if e["event"] == "reaction_done"]
        assert len(done_events) == 3

        # Should have final result
        result_events = [e for e in events if e["event"] == "result"]
        assert len(result_events) == 1

        result = result_events[0]["data"]
        assert "round_number" in result
        assert "challenged_agent_id" in result
        assert "reactions" in result
        assert len(result["reactions"]) == 3
        assert "debate_history" in result

    @pytest.mark.asyncio
    async def test_stream_debate_free_tier_rejected(
        self, app_client, auth_headers, make_user, stub_anthropic
    ):
        """FREE tier user cannot access debate streaming endpoint."""
        from arena.db_models import UserTier
        user = make_user(email="free@test.com", tier=UserTier.FREE)
        from arena.core.auth import create_access_token
        headers = {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}

        res = await app_client.post(
            "/api/debate/stream",
            json={
                "original_prompt": "Test",
                "challenged_agent_id": "agent_1",
                "challenged_verdict": "Test verdict",
                "round_number": 1,
            },
            headers=headers,
        )

        assert res.status_code == 403
        body = res.json()
        assert body["error"] == "feature_not_allowed"
        assert "Plus" in body["message"]

    @pytest.mark.asyncio
    async def test_stream_debate_invalid_challenged_agent(
        self, app_client, auth_headers, make_user, stub_anthropic
    ):
        """Invalid challenged_agent_id returns 400."""
        from arena.db_models import UserTier
        user = make_user(email="debate2@test.com", tier=UserTier.PLUS)
        from arena.core.auth import create_access_token
        headers = {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}

        res = await app_client.post(
            "/api/debate/stream",
            json={
                "original_prompt": "Test",
                "challenged_agent_id": "invalid_agent",
                "challenged_verdict": "Test",
                "round_number": 1,
            },
            headers=headers,
        )

        assert res.status_code == 400

    @pytest.mark.asyncio
    async def test_stream_debate_max_rounds_enforced(
        self, app_client, auth_headers, make_user, stub_anthropic
    ):
        """Round number > 4 returns 400."""
        from arena.db_models import UserTier
        user = make_user(email="debate3@test.com", tier=UserTier.PLUS)
        from arena.core.auth import create_access_token
        headers = {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}

        res = await app_client.post(
            "/api/debate/stream",
            json={
                "original_prompt": "Test",
                "challenged_agent_id": "agent_1",
                "challenged_verdict": "Test",
                "round_number": 5,  # Exceeds max of 4
            },
            headers=headers,
        )

        assert res.status_code == 400

    @pytest.mark.asyncio
    async def test_stream_debate_unauthenticated_rejected(self, app_client):
        """Unauthenticated debate stream requests return 401."""
        res = await app_client.post(
            "/api/debate/stream",
            json={
                "original_prompt": "Test",
                "challenged_agent_id": "agent_1",
                "challenged_verdict": "Test",
                "round_number": 1,
            },
        )
        assert res.status_code == 401

    @pytest.mark.asyncio
    async def test_stream_debate_user_interjection_included(
        self, app_client, auth_headers, make_user, stub_anthropic
    ):
        """User interjection is included in debate history."""
        from arena.db_models import UserTier
        user = make_user(email="debate4@test.com", tier=UserTier.PLUS)
        from arena.core.auth import create_access_token
        headers = {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}

        res = await app_client.post(
            "/api/debate/stream",
            json={
                "original_prompt": "Test",
                "challenged_agent_id": "agent_1",
                "challenged_verdict": "Test",
                "round_number": 1,
                "user_interjection": "What about performance?",
            },
            headers=headers,
        )

        assert res.status_code == 200
        events = self._parse_sse_events(res.text)
        result = [e for e in events if e["event"] == "result"][0]["data"]

        # Check that user interjection is in history
        history = result["debate_history"]
        user_msgs = [h for h in history if h["agent_id"] == "user"]
        assert len(user_msgs) == 1
        assert "performance" in user_msgs[0]["content"].lower()

    @pytest.mark.asyncio
    async def test_stream_debate_history_preserved(
        self, app_client, auth_headers, make_user, stub_anthropic
    ):
        """Debate history is preserved and returned across rounds."""
        from arena.db_models import UserTier
        user = make_user(email="debate5@test.com", tier=UserTier.PLUS)
        from arena.core.auth import create_access_token
        headers = {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}

        # First round
        res1 = await app_client.post(
            "/api/debate/stream",
            json={
                "original_prompt": "Test prompt",
                "challenged_agent_id": "agent_1",
                "challenged_verdict": "First verdict",
                "round_number": 1,
            },
            headers=headers,
        )
        events1 = self._parse_sse_events(res1.text)
        result1 = [e for e in events1 if e["event"] == "result"][0]["data"]

        # Second round with history from first
        res2 = await app_client.post(
            "/api/debate/stream",
            json={
                "original_prompt": "Test prompt",
                "challenged_agent_id": "agent_1",
                "challenged_verdict": "First verdict",
                "round_number": 2,
                "debate_history": result1["debate_history"],
            },
            headers=headers,
        )
        events2 = self._parse_sse_events(res2.text)
        result2 = [e for e in events2 if e["event"] == "result"][0]["data"]

        # History should include round 1 reactions
        assert len(result2["debate_history"]) > len(result1["debate_history"])

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