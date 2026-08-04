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