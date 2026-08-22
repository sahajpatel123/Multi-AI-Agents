from datetime import datetime

import pytest
from arena.core.datetime_utils import utcnow_naive
from arena.core.auth import create_access_token
from arena.db_models import SessionSummary, UserTier


def _make_pro(make_user):
    return make_user(email="pro_memory@example.com", tier=UserTier.PRO)


def _pro_headers(user):
    """Build the Authorization header for a pro-tier user."""
    return {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}


def _seed_summary(db_session, user_id, session_id, summary_text="Test summary", category="question"):
    summary = SessionSummary(
        session_id=session_id,
        user_id=user_id,
        session_summary=summary_text,
        dominant_category=category,
        preferred_depth="moderate",
        trusted_persona="analyst",
        key_positions_taken=[],
        exchange_count=5,
        raw_exchanges_count=5,
        main_topics=["topic1", "topic2"],
        compressed_at=utcnow_naive(),
    )
    db_session.add(summary)
    db_session.flush()
    return summary


@pytest.mark.asyncio
async def test_memory_summaries_csv_export(app_client, make_user, db_session):
    """Test CSV export of memory summaries."""
    user = _make_pro(make_user)
    db_session.commit()

    _seed_summary(db_session, user.id, "sess-1", summary_text="Bitcoin analysis session", category="finance")
    _seed_summary(db_session, user.id, "sess-2", summary_text="Ethereum research", category="crypto")
    db_session.commit()

    res = await app_client.get(
        "/api/memory/summaries/export.csv",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    assert "text/csv" in res.headers["content-type"]
    text = res.text
    assert "id" in text
    assert "session_id" in text
    assert "session_summary" in text
    assert "dominant_category" in text
    assert "sess-1" in text
    assert "sess-2" in text


@pytest.mark.asyncio
async def test_memory_summaries_csv_with_category_filter(app_client, make_user, db_session):
    """Test CSV export with category filter."""
    user = _make_pro(make_user)
    db_session.commit()

    _seed_summary(db_session, user.id, "sess-1", category="finance")
    _seed_summary(db_session, user.id, "sess-2", category="crypto")
    _seed_summary(db_session, user.id, "sess-3", category="finance")
    db_session.commit()

    res = await app_client.get(
        "/api/memory/summaries/export.csv?category=finance",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    text = res.text
    assert "sess-1" in text
    assert "sess-3" in text
    assert "sess-2" not in text


@pytest.mark.asyncio
async def test_memory_summaries_csv_with_search_filter(app_client, make_user, db_session):
    """Test CSV export with search filter."""
    user = _make_pro(make_user)
    db_session.commit()

    _seed_summary(db_session, user.id, "sess-1", summary_text="Bitcoin analysis session")
    _seed_summary(db_session, user.id, "sess-2", summary_text="Ethereum research session")
    db_session.commit()

    res = await app_client.get(
        "/api/memory/summaries/export.csv?search=Bitcoin",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    text = res.text
    assert "sess-1" in text
    assert "Bitcoin" in text


@pytest.mark.asyncio
async def test_memory_summaries_exports_search_main_topics(app_client, make_user, db_session):
    """Exports use the same topic-aware search as the paginated Memory list."""
    user = _make_pro(make_user)
    db_session.commit()

    _seed_summary(db_session, user.id, "sess-topic", summary_text="Unrelated summary")
    row = db_session.query(SessionSummary).filter(SessionSummary.session_id == "sess-topic").one()
    row.main_topics = ["rare topic"]
    db_session.commit()

    for extension in ("csv", "json"):
        res = await app_client.get(
            f"/api/memory/summaries/export.{extension}?search=rare%20topic",
            headers=_pro_headers(user),
        )
        assert res.status_code == 200
        assert "sess-topic" in res.text


@pytest.mark.asyncio
async def test_memory_summaries_exports_apply_the_date_range(app_client, make_user, db_session):
    """CSV, JSON, and Markdown exports mirror the visible date-filtered view."""
    user = _make_pro(make_user)
    db_session.commit()
    before = _seed_summary(db_session, user.id, "sess-before")
    matching = _seed_summary(db_session, user.id, "sess-match")
    after = _seed_summary(db_session, user.id, "sess-after")
    before.compressed_at = datetime(2026, 8, 9, 23, 59, 59)
    matching.compressed_at = datetime(2026, 8, 10, 12, 0, 0)
    after.compressed_at = datetime(2026, 8, 11, 0, 0, 0)
    db_session.commit()

    for extension in ("csv", "json", "md"):
        res = await app_client.get(
            f"/api/memory/summaries/export.{extension}?from_date=2026-08-10&to_date=2026-08-10",
            headers=_pro_headers(user),
        )
        assert res.status_code == 200
        assert "sess-match" in res.text
        assert "sess-before" not in res.text
        assert "sess-after" not in res.text


@pytest.mark.asyncio
async def test_memory_summaries_csv_formula_injection_defense(app_client, make_user, db_session):
    """Test CSV export defends against formula injection."""
    user = _make_pro(make_user)
    db_session.commit()

    _seed_summary(db_session, user.id, "=cmd|'/c calc'!A1", summary_text="=SUM(A1:B1)")
    db_session.commit()

    res = await app_client.get(
        "/api/memory/summaries/export.csv",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    text = res.text
    # Formula should be quoted/escaped
    assert "'=cmd|'/c calc'!A1" in text or "=cmd" not in text


@pytest.mark.asyncio
async def test_memory_summaries_csv_empty(app_client, make_user, db_session):
    """Test CSV export when user has no summaries."""
    user = _make_pro(make_user)
    db_session.commit()

    res = await app_client.get(
        "/api/memory/summaries/export.csv",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    text = res.text
    assert "id" in text  # Header should be present
    assert "sess-1" not in text  # No data rows


@pytest.mark.asyncio
async def test_memory_summaries_csv_403_for_guest(app_client, make_user, db_session):
    """Test that guest users without memory access get 403."""
    from arena.db_models import UserTier as DBUserTier
    user = make_user(email="guest_memory@example.com", tier=DBUserTier.GUEST)
    db_session.commit()

    res = await app_client.get(
        "/api/memory/summaries/export.csv",
        headers={"Authorization": f"Bearer {create_access_token(user.id, user.email)}"},
    )
    # Guest users should get 403 (Forbidden) - memory requires Plus/Pro
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_memory_summaries_json_export(app_client, make_user, db_session):
    """Test JSON export of memory summaries."""
    user = _make_pro(make_user)
    db_session.commit()

    _seed_summary(db_session, user.id, "sess-1", summary_text="Bitcoin analysis")
    _seed_summary(db_session, user.id, "sess-2", summary_text="Ethereum research")
    db_session.commit()

    res = await app_client.get(
        "/api/memory/summaries/export.json",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    assert "application/json" in res.headers["content-type"]
    import json
    items = json.loads(res.text)
    assert len(items) == 2
    session_ids = [item["session_id"] for item in items]
    assert "sess-1" in session_ids
    assert "sess-2" in session_ids


@pytest.mark.asyncio
async def test_memory_summaries_json_export_empty(app_client, make_user, db_session):
    """Test JSON export when user has no summaries."""
    user = _make_pro(make_user)
    db_session.commit()

    res = await app_client.get(
        "/api/memory/summaries/export.json",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    import json
    items = json.loads(res.text)
    assert items == []


@pytest.mark.asyncio
async def test_memory_summaries_json_403_for_guest(app_client, make_user, db_session):
    """Test that guest users without memory access get 403 for JSON export."""
    from arena.db_models import UserTier as DBUserTier
    user = make_user(email="guest_memory_json@example.com", tier=DBUserTier.GUEST)
    db_session.commit()

    res = await app_client.get(
        "/api/memory/summaries/export.json",
        headers={"Authorization": f"Bearer {create_access_token(user.id, user.email)}"},
    )
    # Guest users should get 403 (Forbidden) - memory requires Plus/Pro
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_memory_summaries_markdown_export_includes_filters_and_positions(
    app_client, make_user, db_session
):
    """Markdown export is portable while preserving the active memory view."""
    user = _make_pro(make_user)
    db_session.commit()
    summary = _seed_summary(
        db_session,
        user.id,
        "sess-markdown",
        summary_text="Compared two paths for the launch.",
        category="decision",
    )
    summary.key_positions_taken = [
        {
            "persona_id": "analyst",
            "topic": "Launch timing",
            "stance": "Wait for evidence",
            "confidence": 84,
        }
    ]
    db_session.commit()

    res = await app_client.get(
        "/api/memory/summaries/export.md?category=decision&search=launch",
        headers=_pro_headers(user),
    )

    assert res.status_code == 200
    assert "text/markdown" in res.headers["content-type"]
    assert ".md" in res.headers["content-disposition"]
    assert "# Arena Memory" in res.text
    assert "Filters: Search: launch · Kind: decision" in res.text
    assert "Compared two paths for the launch." in res.text
    assert "Launch timing — Wait for evidence — confidence 84%" in res.text


@pytest.mark.asyncio
async def test_memory_summaries_markdown_flattens_malformed_position_metadata(
    app_client, make_user, db_session
):
    """Legacy or model-derived position fields cannot inject Markdown lines."""
    user = _make_pro(make_user)
    db_session.commit()
    summary = _seed_summary(db_session, user.id, "sess-markdown-safe")
    summary.key_positions_taken = [
        {
            "persona_id": "analyst",
            "topic": "Topic\nwith a break",
            "stance": "Keep `format`",
            "confidence": "84\n\n- forged list item",
        }
    ]
    db_session.commit()

    res = await app_client.get(
        "/api/memory/summaries/export.md",
        headers=_pro_headers(user),
    )

    assert res.status_code == 200
    assert "Topic with a break" in res.text
    assert "Keep \\`format\\`" in res.text
    assert "confidence 84  - forged list item%" in res.text
    assert "\n- forged list item%" not in res.text
