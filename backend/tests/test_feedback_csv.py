from datetime import timedelta

import pytest
from arena.core.datetime_utils import utcnow_naive
from arena.core.auth import create_access_token
from arena.db_models import AnswerFeedback, AgentTask, UserTier


def _make_pro(make_user):
    return make_user(email="pro_feedback@example.com", tier=UserTier.PRO)


def _pro_headers(user):
    """Build the Authorization header for a pro-tier user."""
    return {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}


def _seed_feedback(
    db_session,
    user_id,
    task_id,
    verdict="correct",
    note="Good answer",
    created_at=None,
):
    # First create the task if it doesn't exist
    task = db_session.query(AgentTask).filter(AgentTask.task_id == task_id, AgentTask.user_id == user_id).first()
    if not task:
        task = AgentTask(
            user_id=user_id,
            task_id=task_id,
            task_text=f"Question for {task_id}",
            title=f"Task {task_id}",
            created_at=created_at or utcnow_naive(),
        )
        db_session.add(task)
        db_session.flush()
    
    feedback = AnswerFeedback(
        user_id=user_id,
        task_id=task_id,
        verdict=verdict,
        note=note,
        created_at=created_at or utcnow_naive(),
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
async def test_feedback_exports_support_inclusive_utc_date_range(
    app_client, make_user, db_session
):
    """All feedback export formats share an inclusive UTC calendar filter."""
    user = _make_pro(make_user)
    db_session.commit()
    now = utcnow_naive()
    _seed_feedback(
        db_session,
        user.id,
        "task-old",
        created_at=now - timedelta(days=5),
    )
    _seed_feedback(
        db_session,
        user.id,
        "task-recent",
        verdict="partial",
        created_at=now - timedelta(days=1),
    )
    db_session.commit()

    query = (
        f"?from_date={(now - timedelta(days=2)).date().isoformat()}"
        f"&to_date={now.date().isoformat()}"
    )
    csv_res = await app_client.get(
        f"/api/agent/feedback/export.csv{query}",
        headers=_pro_headers(user),
    )
    json_res = await app_client.get(
        f"/api/agent/feedback/export.json{query}",
        headers=_pro_headers(user),
    )
    markdown_res = await app_client.get(
        f"/api/agent/feedback/export.md{query}",
        headers=_pro_headers(user),
    )

    assert csv_res.status_code == json_res.status_code == markdown_res.status_code == 200
    assert "task-recent" in csv_res.text
    assert "task-old" not in csv_res.text
    assert [item["task_id"] for item in json_res.json()] == ["task-recent"]
    assert "task-recent" in markdown_res.text
    assert "task-old" not in markdown_res.text
    assert f"{(now - timedelta(days=2)).date().isoformat()}" in markdown_res.text
    assert f"{now.date().isoformat()}" in markdown_res.text


@pytest.mark.asyncio
async def test_feedback_export_rejects_reversed_date_range(app_client, make_user, db_session):
    user = _make_pro(make_user)
    db_session.commit()

    res = await app_client.get(
        "/api/agent/feedback/export.json?from_date=2026-08-20&to_date=2026-08-01",
        headers=_pro_headers(user),
    )

    assert res.status_code == 422
    assert res.json()["detail"]["error"] == "invalid_date_range"


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


@pytest.mark.asyncio
async def test_feedback_markdown_export_includes_summary_and_escapes_metadata(
    app_client, make_user, db_session
):
    """Markdown is readable while feedback metadata cannot forge structure."""
    user = _make_pro(make_user)
    db_session.commit()

    feedback = _seed_feedback(
        db_session,
        user.id,
        "task-md",
        verdict="correct",
        note="Keep `format`\n- forged list item <script>alert(1)</script> ~~strike~~",
    )
    task = db_session.query(AgentTask).filter(AgentTask.task_id == feedback.task_id).one()
    task.title = "# Hidden [link] <https://example.com>"
    db_session.commit()

    res = await app_client.get(
        "/api/agent/feedback/export.md",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/markdown")
    assert res.headers["content-disposition"].endswith(".md\"")
    assert res.headers["x-content-type-options"] == "nosniff"
    assert "# Arena — answer feedback" in res.text
    assert "**Ratings:** 1" in res.text
    assert "- **Correct:** 1" in res.text
    assert "### 1. correct — \\# Hidden \\[link\\] \\<https://example.com\\>" in res.text
    assert "- **Task ID:** task-md" in res.text
    assert (
        "Keep \\`format\\` - forged list item \\<script\\>alert(1)\\</script\\> "
        "\\~\\~strike\\~\\~"
    ) in res.text
    assert "\n- forged list item\n" not in res.text


@pytest.mark.asyncio
async def test_feedback_markdown_honors_verdict_filter_and_empty_state(
    app_client, make_user, db_session
):
    user = _make_pro(make_user)
    db_session.commit()
    _seed_feedback(db_session, user.id, "task-correct", verdict="correct")
    _seed_feedback(db_session, user.id, "task-partial", verdict="partial")
    db_session.commit()

    res = await app_client.get(
        "/api/agent/feedback/export.md?verdict=correct",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    assert "**Filter:** correct" in res.text
    assert "**Ratings:** 1" in res.text
    assert "task-correct" in res.text
    assert "task-partial" not in res.text
    assert "- **Partial:** 0" in res.text

    empty_res = await app_client.get(
        "/api/agent/feedback/export.md?verdict=wrong",
        headers=_pro_headers(user),
    )
    assert empty_res.status_code == 200
    assert "**Ratings:** 0" in empty_res.text
    assert "_No answer feedback recorded._" in empty_res.text
    assert "task-correct" not in empty_res.text
