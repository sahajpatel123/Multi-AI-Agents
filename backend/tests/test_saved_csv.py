import pytest
from arena.core.datetime_utils import utcnow_naive
from arena.core.auth import create_access_token
from arena.db_models import SavedResponse, UserTier


def _make_pro(make_user):
    return make_user(email="pro_saved@example.com", tier=UserTier.PRO)


def _pro_headers(user):
    """Build the Authorization header for a pro-tier user."""
    return {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}


def _seed_saved(db_session, user_id, saved_id, prompt="Test prompt", one_liner="Test answer", score=85, persona_id=None):
    saved = SavedResponse(
        user_id=user_id,
        session_id=f"sess-{saved_id}",
        agent_id=f"agent-{saved_id}",
        persona_id=persona_id or f"persona-{saved_id}",
        persona_name=f"Persona {saved_id}",
        persona_color="blue",
        prompt=prompt,
        one_liner=one_liner,
        verdict=f"This is the verdict for {saved_id}",
        score=score,
        confidence=90,
        saved_at=utcnow_naive(),
    )
    db_session.add(saved)
    db_session.flush()
    return saved


@pytest.mark.asyncio
async def test_saved_csv_export(app_client, make_user, db_session):
    """Test CSV export of saved responses."""
    user = _make_pro(make_user)
    db_session.commit()
    
    _seed_saved(db_session, user.id, "save-1", prompt="Bitcoin question", score=90)
    _seed_saved(db_session, user.id, "save-2", prompt="Ethereum question", score=85)
    db_session.commit()

    res = await app_client.get(
        "/api/saved/export.csv",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    assert "text/csv" in res.headers["content-type"]
    text = res.text
    assert "id" in text
    assert "session_id" in text
    assert "prompt" in text
    assert "one_liner" in text
    assert "verdict" in text
    assert "score" in text
    assert "sess-save-1" in text
    assert "sess-save-2" in text


@pytest.mark.asyncio
async def test_saved_csv_with_search_filter(app_client, make_user, db_session):
    """Test CSV export with search filter."""
    user = _make_pro(make_user)
    db_session.commit()
    
    _seed_saved(db_session, user.id, "save-1", prompt="Bitcoin analysis", one_liner="Bitcoin is up")
    _seed_saved(db_session, user.id, "save-2", prompt="Ethereum analysis", one_liner="Ethereum is down")
    _seed_saved(db_session, user.id, "save-3", prompt="Bitcoin forecast", one_liner="Bitcoin will rise")
    db_session.commit()

    res = await app_client.get(
        "/api/saved/export.csv?search=Bitcoin",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    text = res.text
    assert "sess-save-1" in text
    assert "sess-save-3" in text
    assert "sess-save-2" not in text


@pytest.mark.asyncio
async def test_saved_csv_with_persona_filter(app_client, make_user, db_session):
    """Test CSV export with persona filter."""
    user = _make_pro(make_user)
    db_session.commit()
    
    _seed_saved(db_session, user.id, "save-1", persona_id="analyst")
    _seed_saved(db_session, user.id, "save-2", persona_id="researcher")
    _seed_saved(db_session, user.id, "save-3", persona_id="analyst")
    db_session.commit()

    res = await app_client.get(
        "/api/saved/export.csv?persona_id=analyst",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    text = res.text
    assert "sess-save-1" in text
    assert "sess-save-3" in text
    assert "sess-save-2" not in text


@pytest.mark.asyncio
async def test_saved_csv_with_min_score_filter(app_client, make_user, db_session):
    """Test CSV export with minimum score filter."""
    user = _make_pro(make_user)
    db_session.commit()
    
    _seed_saved(db_session, user.id, "save-1", score=90)
    _seed_saved(db_session, user.id, "save-2", score=80)
    _seed_saved(db_session, user.id, "save-3", score=85)
    db_session.commit()

    res = await app_client.get(
        "/api/saved/export.csv?min_score=85",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    text = res.text
    assert "sess-save-1" in text
    assert "sess-save-3" in text
    assert "sess-save-2" not in text


@pytest.mark.asyncio
async def test_saved_csv_with_sort(app_client, make_user, db_session):
    """Test CSV export with sort parameter."""
    user = _make_pro(make_user)
    db_session.commit()
    
    _seed_saved(db_session, user.id, "save-1", score=90)
    _seed_saved(db_session, user.id, "save-2", score=80)
    _seed_saved(db_session, user.id, "save-3", score=85)
    db_session.commit()

    # Test score sort (descending)
    res = await app_client.get(
        "/api/saved/export.csv?sort=score",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    # The order in CSV should have highest score first
    text = res.text
    assert "id" in text
    assert "sess-save-1" in text


@pytest.mark.asyncio
async def test_saved_csv_formula_injection_defense(app_client, make_user, db_session):
    """Test CSV export defends against formula injection."""
    user = _make_pro(make_user)
    db_session.commit()
    
    _seed_saved(db_session, user.id, "formula-test", prompt="=SUM(A1:B1)")
    db_session.commit()

    res = await app_client.get(
        "/api/saved/export.csv",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    text = res.text
    # Formula should be quoted/escaped
    assert "'=SUM(A1:B1)" in text or "=SUM" not in text


@pytest.mark.asyncio
async def test_saved_csv_empty(app_client, make_user, db_session):
    """Test CSV export when user has no saved responses."""
    user = _make_pro(make_user)
    db_session.commit()

    res = await app_client.get(
        "/api/saved/export.csv",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    text = res.text
    assert "id" in text  # Header should be present
    assert "sess-save" not in text  # No data rows


@pytest.mark.asyncio
async def test_saved_csv_403_for_guest(app_client, make_user, db_session):
    """Test that guest users without access get 403."""
    from arena.db_models import UserTier as DBUserTier
    user = make_user(email="guest_saved@example.com", tier=DBUserTier.GUEST)
    db_session.commit()

    res = await app_client.get(
        "/api/saved/export.csv",
        headers={"Authorization": f"Bearer {create_access_token(user.id, user.email)}"},
    )
    # Guest users should get 403 (Forbidden) - saved responses require Plus/Pro
    assert res.status_code == 403