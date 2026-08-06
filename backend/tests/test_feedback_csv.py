import pytest
from arena.core.datetime_utils import utcnow_naive
from arena.core.auth import create_access_token
from arena.db_models import AnswerFeedback, AgentTask, UserTier


def _make_pro(make_user):
    return make_user(email="pro_feedback@example.com", tier=UserTier.PRO)


def _pro_headers(user):
    """Build the Authorization header for a pro-tier user."""
    return {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}


def _seed_feedback(db_session, user_id, task_id, verdict="correct", note="Good answer"):
    # First create the task if it doesn't exist
    task = db_session.query(AgentTask).filter(AgentTask.task_id == task_id, AgentTask.user_id == user_id).first()
    if not task:
        task = AgentTask(
            user_id=user_id,
            task_id=task_id,
            task_text=f"Question for {task_id}",
            title=f"Task {task_id}",
            created_at=utcnow_naive(),
        )
        db_session.add(task)
        db_session.flush()
    
    feedback = AnswerFeedback(
        user_id=user_id,
        task_id=task_id,
        verdict=verdict,
        note=note,
        created_at=utcnow_naive(),
    )
    db_session.add(feedback)
    db_session.flush()
    return feedback


@pytest.mark.asyncio
async def test_feedback_csv_export(app_client, make_user, db_session):
    """Test CSV export of feedback."""
    user = _make_pro(make_user)
    db_session.commit()
    
    _seed_feedback(db_session, user.id, "task-1", verdict="correct", note="Good answer")
    _seed_feedback(db_session, user.id, "task-2", verdict="partial", note="Partial answer")
    _seed_feedback(db_session, user.id, "task-3", verdict="wrong", note="Wrong answer")
    db_session.commit()

    res = await app_client.get(
        "/api/agent/feedback/export.csv",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    assert "text/csv" in res.headers["content-type"]
    text = res.text
    assert "id" in text
    assert "task_id" in text
    assert "title" in text
    assert "verdict" in text
    assert "note" in text
    assert "created_at" in text
    assert "task-1" in text
    assert "task-2" in text
    assert "task-3" in text
    assert "correct" in text
    assert "partial" in text
    assert "wrong" in text


@pytest.mark.asyncio
async def test_feedback_csv_with_verdict_filter(app_client, make_user, db_session):
    """Test CSV export with verdict filter."""
    user = _make_pro(make_user)
    db_session.commit()
    
    _seed_feedback(db_session, user.id, "task-1", verdict="correct")
    _seed_feedback(db_session, user.id, "task-2", verdict="partial")
    _seed_feedback(db_session, user.id, "task-3", verdict="correct")
    db_session.commit()

    res = await app_client.get(
        "/api/agent/feedback/export.csv?verdict=correct",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    text = res.text
    assert "task-1" in text
    assert "task-3" in text
    assert "task-2" not in text


@pytest.mark.asyncio
async def test_feedback_csv_with_unknown_verdict(app_client, make_user, db_session):
    """Test CSV export with unknown verdict returns empty."""
    user = _make_pro(make_user)
    db_session.commit()
    
    _seed_feedback(db_session, user.id, "task-1", verdict="correct")
    db_session.commit()

    res = await app_client.get(
        "/api/agent/feedback/export.csv?verdict=unknown",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    text = res.text
    assert "task-1" not in text
    # Header should still be present
    assert "task_id" in text


@pytest.mark.asyncio
async def test_feedback_csv_formula_injection_defense(app_client, make_user, db_session):
    """Test CSV export defends against formula injection."""
    user = _make_pro(make_user)
    db_session.commit()
    
    _seed_feedback(db_session, user.id, "=cmd|'/c calc'!A1", note="=SUM(A1:B1)")
    db_session.commit()

    res = await app_client.get(
        "/api/agent/feedback/export.csv",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    text = res.text
    # Formula should be quoted/escaped
    assert "'=cmd|'/c calc'!A1" in text or "=cmd" not in text


@pytest.mark.asyncio
async def test_feedback_csv_empty(app_client, make_user, db_session):
    """Test CSV export when user has no feedback."""
    user = _make_pro(make_user)
    db_session.commit()

    res = await app_client.get(
        "/api/agent/feedback/export.csv",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    text = res.text
    assert "task_id" in text  # Header should be present
    assert "task-1" not in text  # No data rows


@pytest.mark.asyncio
async def test_feedback_json_export(app_client, make_user, db_session):
    """Test JSON export of feedback."""
    user = _make_pro(make_user)
    db_session.commit()
    
    _seed_feedback(db_session, user.id, "task-1", verdict="correct", note="Good answer")
    _seed_feedback(db_session, user.id, "task-2", verdict="partial", note="Partial answer")
    db_session.commit()

    res = await app_client.get(
        "/api/agent/feedback/export.json",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    assert "application/json" in res.headers["content-type"]
    import json
    items = json.loads(res.text)
    assert len(items) == 2
    task_ids = [item["task_id"] for item in items]
    assert "task-1" in task_ids
    assert "task-2" in task_ids
    # Check fields
    assert "id" in items[0]
    assert "title" in items[0]
    assert "verdict" in items[0]
    assert "note" in items[0]
    assert "created_at" in items[0]


@pytest.mark.asyncio
async def test_feedback_json_with_verdict_filter(app_client, make_user, db_session):
    """Test JSON export with verdict filter."""
    user = _make_pro(make_user)
    db_session.commit()
    
    _seed_feedback(db_session, user.id, "task-1", verdict="correct")
    _seed_feedback(db_session, user.id, "task-2", verdict="partial")
    _seed_feedback(db_session, user.id, "task-3", verdict="correct")
    db_session.commit()

    res = await app_client.get(
        "/api/agent/feedback/export.json?verdict=correct",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    import json
    items = json.loads(res.text)
    assert len(items) == 2
    task_ids = [item["task_id"] for item in items]
    assert "task-1" in task_ids
    assert "task-3" in task_ids
    assert "task-2" not in task_ids


@pytest.mark.asyncio
async def test_feedback_json_export_empty(app_client, make_user, db_session):
    """Test JSON export when user has no feedback."""
    user = _make_pro(make_user)
    db_session.commit()

    res = await app_client.get(
        "/api/agent/feedback/export.json",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    import json
    items = json.loads(res.text)
    assert items == []