import pytest
from arena.core.datetime_utils import utcnow_naive
from arena.core.auth import create_access_token
from arena.db_models import Orchestration, UserTier


def _make_pro(make_user):
    return make_user(email="pro_orch@example.com", tier=UserTier.PRO)


def _pro_headers(user):
    """Build the Authorization header for a pro-tier user."""
    return {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}


def _seed_orchestration(db_session, user_id, orch_id, status="complete", task_ids=None):
    orch = Orchestration(
        id=orch_id,
        user_id=user_id,
        status=status,
        task_ids=task_ids or [],
        synthesis="This is a test synthesis",
        synthesis_bullets=["Point 1", "Point 2"],
        conflicts=[],
        created_at=utcnow_naive(),
    )
    db_session.add(orch)
    db_session.flush()
    return orch


@pytest.mark.asyncio
async def test_list_orchestrations_empty(app_client, make_user, db_session):
    """Test listing orchestrations when user has none."""
    user = _make_pro(make_user)
    db_session.commit()

    res = await app_client.get(
        "/api/agent/orchestrations",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["orchestrations"] == []
    assert data["total"] == 0


@pytest.mark.asyncio
async def test_list_orchestrations_single(app_client, make_user, db_session):
    """Test listing orchestrations with one orchestration."""
    user = _make_pro(make_user)
    db_session.commit()

    _seed_orchestration(db_session, user.id, "orch-1", status="complete", task_ids=["task-1", "task-2"])
    db_session.commit()

    res = await app_client.get(
        "/api/agent/orchestrations",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert len(data["orchestrations"]) == 1
    assert data["orchestrations"][0]["id"] == "orch-1"
    assert data["orchestrations"][0]["status"] == "complete"
    assert data["orchestrations"][0]["task_count"] == 2
    assert data["total"] == 1


@pytest.mark.asyncio
async def test_list_orchestrations_multiple(app_client, make_user, db_session):
    """Test listing orchestrations with multiple orchestrations."""
    user = _make_pro(make_user)
    db_session.commit()

    _seed_orchestration(db_session, user.id, "orch-1", status="complete")
    _seed_orchestration(db_session, user.id, "orch-2", status="running")
    _seed_orchestration(db_session, user.id, "orch-3", status="failed")
    db_session.commit()

    res = await app_client.get(
        "/api/agent/orchestrations",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert len(data["orchestrations"]) == 3
    assert data["total"] == 3


@pytest.mark.asyncio
async def test_list_orchestrations_filter_by_status(app_client, make_user, db_session):
    """Test filtering orchestrations by status."""
    user = _make_pro(make_user)
    db_session.commit()

    _seed_orchestration(db_session, user.id, "orch-1", status="complete")
    _seed_orchestration(db_session, user.id, "orch-2", status="running")
    _seed_orchestration(db_session, user.id, "orch-3", status="failed")
    db_session.commit()

    # Filter by complete
    res = await app_client.get(
        "/api/agent/orchestrations?status=complete",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert len(data["orchestrations"]) == 1
    assert data["orchestrations"][0]["status"] == "complete"

    # Filter by running
    res = await app_client.get(
        "/api/agent/orchestrations?status=running",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert len(data["orchestrations"]) == 1
    assert data["orchestrations"][0]["status"] == "running"


@pytest.mark.asyncio
async def test_list_orchestrations_pagination(app_client, make_user, db_session):
    """Test pagination of orchestrations."""
    user = _make_pro(make_user)
    db_session.commit()

    # Create 5 orchestrations
    for i in range(5):
        _seed_orchestration(db_session, user.id, f"orch-{i}", status="complete")
    db_session.commit()

    # Get first page (per_page=2)
    res = await app_client.get(
        "/api/agent/orchestrations?page=1&per_page=2",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert len(data["orchestrations"]) == 2
    assert data["page"] == 1
    assert data["per_page"] == 2
    assert data["total"] == 5
    assert data["total_pages"] == 3

    # Get second page
    res = await app_client.get(
        "/api/agent/orchestrations?page=2&per_page=2",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert len(data["orchestrations"]) == 2
    assert data["page"] == 2


@pytest.mark.asyncio
async def test_export_orchestrations_csv(app_client, make_user, db_session):
    """Test CSV export of orchestrations."""
    user = _make_pro(make_user)
    db_session.commit()

    _seed_orchestration(db_session, user.id, "orch-1", status="complete", task_ids=["task-1", "task-2"])
    _seed_orchestration(db_session, user.id, "orch-2", status="running", task_ids=["task-3"])
    db_session.commit()

    res = await app_client.get(
        "/api/agent/orchestrations/export.csv",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    assert "text/csv" in res.headers["content-type"]
    text = res.text
    assert "id" in text
    assert "status" in text
    assert "created_at" in text
    assert "task_count" in text
    assert "orch-1" in text
    assert "orch-2" in text
    assert "complete" in text
    assert "running" in text


@pytest.mark.asyncio
async def test_export_orchestrations_csv_with_status_filter(app_client, make_user, db_session):
    """Test CSV export with status filter."""
    user = _make_pro(make_user)
    db_session.commit()

    _seed_orchestration(db_session, user.id, "orch-1", status="complete")
    _seed_orchestration(db_session, user.id, "orch-2", status="running")
    _seed_orchestration(db_session, user.id, "orch-3", status="complete")
    db_session.commit()

    res = await app_client.get(
        "/api/agent/orchestrations/export.csv?status=complete",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    text = res.text
    assert "orch-1" in text
    assert "orch-3" in text
    assert "orch-2" not in text


@pytest.mark.asyncio
async def test_export_orchestrations_csv_formula_injection_defense(app_client, make_user, db_session):
    """Test CSV export defends against formula injection."""
    user = _make_pro(make_user)
    db_session.commit()

    # Create an orchestration with formula-like ID
    from arena.db_models import Orchestration
    from arena.core.datetime_utils import utcnow_naive
    orch = Orchestration(
        id="=cmd|'/c calc'!A1",
        user_id=user.id,
        status="complete",
        task_ids=[],
        synthesis="=SUM(A1:B1)",
        synthesis_bullets=[],
        conflicts=[],
        created_at=utcnow_naive(),
    )
    db_session.add(orch)
    db_session.commit()

    res = await app_client.get(
        "/api/agent/orchestrations/export.csv",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    text = res.text
    # Formula should be quoted/escaped
    assert "'=cmd|'/c calc'!A1" in text or "=cmd" not in text


@pytest.mark.asyncio
async def test_export_orchestrations_csv_empty(app_client, make_user, db_session):
    """Test CSV export when user has no orchestrations."""
    user = _make_pro(make_user)
    db_session.commit()

    res = await app_client.get(
        "/api/agent/orchestrations/export.csv",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    text = res.text
    assert "id" in text  # Header should be present
    assert "status" in text
