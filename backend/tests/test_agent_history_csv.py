import pytest
from datetime import timedelta
from arena.core.datetime_utils import utcnow_naive
from arena.core.auth import create_access_token
from arena.db_models import AgentTask, UserTier


def _make_pro(make_user):
    return make_user(email="pro_history@example.com", tier=UserTier.PRO)


def _pro_headers(user):
    """Build the Authorization header for a pro-tier user."""
    return {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}


def _seed_task(db_session, user_id, task_id_suffix, score=85, title="Test Task", task_text="Test task text"):
    task = AgentTask(
        user_id=user_id,
        task_id=f"task-{task_id_suffix}",
        task_text=task_text,
        title=title,
        final_score=score,
        final_confidence=0.95,
        user_feedback=None,
        created_at=utcnow_naive(),
    )
    db_session.add(task)
    db_session.flush()
    return task


@pytest.mark.asyncio
async def test_agent_history_csv_export(app_client, make_user, db_session):
    """Test CSV export of agent history."""
    user = _make_pro(make_user)
    db_session.commit()
    
    _seed_task(db_session, user.id, "1", score=90, title="Bitcoin Analysis", task_text="Analyze Bitcoin trends")
    _seed_task(db_session, user.id, "2", score=85, title="Ethereum Analysis", task_text="Analyze Ethereum trends")
    _seed_task(db_session, user.id, "3", score=75, title="Market Overview", task_text="Overview of crypto market")
    db_session.commit()

    res = await app_client.get(
        "/api/agent/history/export.csv",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    assert "text/csv" in res.headers["content-type"]
    text = res.text
    assert "task_id" in text
    assert "title" in text
    assert "task_text" in text
    assert "final_score" in text
    assert "Bitcoin Analysis" in text
    assert "Ethereum Analysis" in text


@pytest.mark.asyncio
async def test_agent_history_csv_with_search(app_client, make_user, db_session):
    """Test CSV export with search filter."""
    user = _make_pro(make_user)
    db_session.commit()
    
    _seed_task(db_session, user.id, "1", score=90, title="Bitcoin Analysis", task_text="Analyze Bitcoin trends")
    _seed_task(db_session, user.id, "2", score=85, title="Ethereum Analysis", task_text="Analyze Ethereum trends")
    _seed_task(db_session, user.id, "3", score=75, title="Bitcoin Price", task_text="Bitcoin price analysis")
    db_session.commit()

    res = await app_client.get(
        "/api/agent/history/export.csv?search=Bitcoin",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    text = res.text
    assert "Bitcoin Analysis" in text
    assert "Bitcoin Price" in text
    # Ethereum should not be in results
    assert "Ethereum" not in text or "Ethereum Analysis" not in text


@pytest.mark.asyncio
async def test_agent_history_csv_formula_injection_defense(app_client, make_user, db_session):
    """Test CSV export defends against formula injection."""
    user = _make_pro(make_user)
    db_session.commit()
    
    _seed_task(db_session, user.id, "1", task_text="=cmd|'/c calc'!A1")
    db_session.commit()

    res = await app_client.get(
        "/api/agent/history/export.csv",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    text = res.text
    # Formula should be quoted/escaped
    assert "'=cmd|'/c calc'!A1" in text or "=cmd" not in text


@pytest.mark.asyncio
async def test_agent_history_csv_empty(app_client, make_user, db_session):
    """Test CSV export when user has no tasks."""
    user = _make_pro(make_user)
    db_session.commit()

    res = await app_client.get(
        "/api/agent/history/export.csv",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    text = res.text
    assert "task_id" in text  # Header should be present
    assert "Test Task" not in text  # No data rows


@pytest.mark.asyncio
async def test_agent_history_json_export(app_client, make_user, db_session):
    """Test JSON export of agent history."""
    user = _make_pro(make_user)
    db_session.commit()
    
    _seed_task(db_session, user.id, "1", score=90, title="Bitcoin Analysis", task_text="Analyze Bitcoin trends")
    _seed_task(db_session, user.id, "2", score=85, title="Ethereum Analysis", task_text="Analyze Ethereum trends")
    db_session.commit()

    res = await app_client.get(
        "/api/agent/history/export.json",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    assert "application/json" in res.headers["content-type"]
    import json
    tasks = json.loads(res.text)
    assert len(tasks) == 2
    titles = [t["title"] for t in tasks]
    assert "Bitcoin Analysis" in titles
    assert "Ethereum Analysis" in titles


@pytest.mark.asyncio
async def test_agent_history_json_with_search(app_client, make_user, db_session):
    """Test JSON export with search filter."""
    user = _make_pro(make_user)
    db_session.commit()
    
    _seed_task(db_session, user.id, "1", score=90, title="Bitcoin Analysis")
    _seed_task(db_session, user.id, "2", score=85, title="Ethereum Analysis")
    _seed_task(db_session, user.id, "3", score=75, title="Bitcoin Price")
    db_session.commit()

    res = await app_client.get(
        "/api/agent/history/export.json?search=Bitcoin",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    import json
    tasks = json.loads(res.text)
    assert len(tasks) == 2
    titles = [t["title"] for t in tasks]
    assert "Bitcoin Analysis" in titles
    assert "Bitcoin Price" in titles


@pytest.mark.asyncio
async def test_agent_history_json_empty(app_client, make_user, db_session):
    """Test JSON export when user has no tasks."""
    user = _make_pro(make_user)
    db_session.commit()

    res = await app_client.get(
        "/api/agent/history/export.json",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    import json
    tasks = json.loads(res.text)
    assert tasks == []
