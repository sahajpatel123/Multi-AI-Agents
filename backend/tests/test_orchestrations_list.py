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
async def test_export_single_orchestration_markdown(
    app_client, make_user, db_session
):
    user = _make_pro(make_user)
    orch = _seed_orchestration(
        db_session,
        user.id,
        "orch-single-md",
        status="complete",
        task_ids=["task-a", "task-b"],
    )
    orch.synthesis = "Safe **Markdown**\n\n<script>alert('unsafe')</script>"
    orch.conflicts = [
        {"task_a": "task-a", "task_b": "task-b", "conflict": "Different assumptions"}
    ]
    db_session.commit()

    res = await app_client.get(
        "/api/agent/orchestrate/orch-single-md/export.md",
        headers=_pro_headers(user),
    )

    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/markdown")
    assert res.headers["x-content-type-options"] == "nosniff"
    assert res.headers["cache-control"] == "no-store, no-cache, must-revalidate, private"
    assert 'filename="arena-orchestration-orch-sin.md"' in res.headers["content-disposition"]
    assert "# Arena orchestration report" in res.text
    assert "## Orchestration orch-single-md" in res.text
    assert "**Status:** complete" in res.text
    assert "Safe **Markdown**" in res.text
    assert "### Supporting points" in res.text
    assert "### Conflicts" in res.text
    assert "Different assumptions" in res.text
    assert "<script>" not in res.text
    assert "&lt;script&gt;alert('unsafe')&lt;/script&gt;" in res.text


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["running", "failed", "cancelled"])
async def test_export_single_orchestration_markdown_rejects_incomplete_run(
    app_client, make_user, db_session, status
):
    user = _make_pro(make_user)
    orchestration_id = f"orch-{status}-md"
    _seed_orchestration(
        db_session,
        user.id,
        orchestration_id,
        status=status,
        task_ids=["task-a"],
    )
    db_session.commit()

    res = await app_client.get(
        f"/api/agent/orchestrate/{orchestration_id}/export.md",
        headers=_pro_headers(user),
    )

    assert res.status_code == 400
    assert res.json()["detail"] == {
        "error": "feature_not_allowed",
        "message": "Orchestration is not complete yet",
    }


@pytest.mark.asyncio
async def test_export_single_orchestration_markdown_is_caller_scoped(
    app_client, make_user, db_session
):
    owner = _make_pro(make_user)
    outsider = make_user(email="other_pro_orch@example.com", tier=UserTier.PRO)
    _seed_orchestration(db_session, owner.id, "orch-private-md")
    db_session.commit()

    res = await app_client.get(
        "/api/agent/orchestrate/orch-private-md/export.md",
        headers=_pro_headers(outsider),
    )

    assert res.status_code == 404
    assert res.json()["detail"]["error"] == "not_found"


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
async def test_export_orchestrations_csv_rejects_unknown_status(app_client, make_user, db_session):
    """Reject typos instead of returning a misleading header-only export."""
    user = _make_pro(make_user)
    db_session.commit()

    res = await app_client.get(
        "/api/agent/orchestrations/export.csv?status=finished",
        headers=_pro_headers(user),
    )

    assert res.status_code == 422
    assert "status" in res.text


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


@pytest.mark.asyncio
async def test_export_orchestrations_json_preserves_synthesis_details(
    app_client, make_user, db_session
):
    """JSON export keeps the structured synthesis omitted by the CSV view."""
    user = _make_pro(make_user)
    db_session.commit()

    _seed_orchestration(
        db_session,
        user.id,
        "orch-json-1",
        status="complete",
        task_ids=["task-1", "task-2"],
    )
    db_session.commit()

    res = await app_client.get(
        "/api/agent/orchestrations/export.json",
        headers=_pro_headers(user),
    )

    assert res.status_code == 200
    assert res.headers["content-type"] == "application/json; charset=utf-8"
    assert res.headers["x-content-type-options"] == "nosniff"
    assert res.headers["cache-control"] == "no-store, no-cache, must-revalidate, private"
    assert "arena-orchestrations-" in res.headers["content-disposition"]
    payload = res.json()
    assert payload == [
        {
            "id": "orch-json-1",
            "status": "complete",
            "created_at": payload[0]["created_at"],
            "task_count": 2,
            "task_ids": ["task-1", "task-2"],
            "synthesis": "This is a test synthesis",
            "synthesis_bullets": ["Point 1", "Point 2"],
            "conflicts": [],
        }
    ]


@pytest.mark.asyncio
async def test_export_orchestrations_json_applies_status_filter(
    app_client, make_user, db_session
):
    user = _make_pro(make_user)
    db_session.commit()

    _seed_orchestration(db_session, user.id, "orch-json-complete", status="complete")
    _seed_orchestration(db_session, user.id, "orch-json-running", status="running")
    db_session.commit()

    res = await app_client.get(
        "/api/agent/orchestrations/export.json?status=complete",
        headers=_pro_headers(user),
    )

    assert res.status_code == 200
    assert [item["id"] for item in res.json()] == ["orch-json-complete"]


@pytest.mark.asyncio
async def test_export_orchestrations_json_rejects_unknown_status(
    app_client, make_user, db_session
):
    user = _make_pro(make_user)
    db_session.commit()

    res = await app_client.get(
        "/api/agent/orchestrations/export.json?status=finished",
        headers=_pro_headers(user),
    )

    assert res.status_code == 422
    assert "status" in res.text


@pytest.mark.asyncio
async def test_export_orchestrations_json_empty_is_valid_array(
    app_client, make_user, db_session
):
    user = _make_pro(make_user)
    db_session.commit()

    res = await app_client.get(
        "/api/agent/orchestrations/export.json",
        headers=_pro_headers(user),
    )

    assert res.status_code == 200
    assert res.json() == []
    assert res.text.endswith("\n")


@pytest.mark.asyncio
async def test_export_orchestrations_markdown_includes_synthesis_details(
    app_client, make_user, db_session
):
    """Markdown export is readable while retaining structured run details."""
    user = _make_pro(make_user)
    db_session.commit()

    _seed_orchestration(
        db_session,
        user.id,
        "orch-md-1",
        status="complete",
        task_ids=["task-a", "task-b"],
    )
    db_session.commit()

    res = await app_client.get(
        "/api/agent/orchestrations/export.md",
        headers=_pro_headers(user),
    )

    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/markdown")
    assert res.headers["x-content-type-options"] == "nosniff"
    assert res.headers["cache-control"] == "no-store, no-cache, must-revalidate, private"
    assert "arena-orchestrations-" in res.headers["content-disposition"]
    body = res.text
    assert "# Arena orchestration history" in body
    assert "orch-md-1" in body
    assert "**Status:** complete" in body
    assert "**Tasks:** 2" in body
    assert "task-a" in body
    assert "### Synthesis" in body
    assert "This is a test synthesis" in body
    assert "### Supporting points" in body
    assert "Point 1" in body


@pytest.mark.asyncio
async def test_export_orchestrations_markdown_applies_status_filter(
    app_client, make_user, db_session
):
    user = _make_pro(make_user)
    db_session.commit()

    _seed_orchestration(db_session, user.id, "orch-md-complete", status="complete")
    _seed_orchestration(db_session, user.id, "orch-md-running", status="running")
    db_session.commit()

    res = await app_client.get(
        "/api/agent/orchestrations/export.md?status=complete",
        headers=_pro_headers(user),
    )

    assert res.status_code == 200
    assert "orch-md-complete" in res.text
    assert "orch-md-running" not in res.text


@pytest.mark.asyncio
async def test_export_orchestrations_markdown_empty_is_valid_document(
    app_client, make_user, db_session
):
    user = _make_pro(make_user)
    db_session.commit()

    res = await app_client.get(
        "/api/agent/orchestrations/export.md",
        headers=_pro_headers(user),
    )

    assert res.status_code == 200
    assert "# Arena orchestration history" in res.text
    assert "_No orchestrations found._" in res.text


@pytest.mark.asyncio
async def test_export_orchestrations_markdown_escapes_html_in_synthesis(
    app_client, make_user, db_session
):
    """LLM synthesis keeps useful Markdown without emitting active HTML."""
    user = _make_pro(make_user)
    db_session.commit()

    orch = _seed_orchestration(db_session, user.id, "orch-md-hostile")
    orch.synthesis = (
        "#### Preserved detail\n\n"
        "- Safe **Markdown** remains useful.\n\n"
        "<script>alert('unsafe')</script>\n"
        '<img src=x onerror="alert(1)">'
    )
    db_session.commit()

    res = await app_client.get(
        "/api/agent/orchestrations/export.md",
        headers=_pro_headers(user),
    )

    assert res.status_code == 200
    assert "#### Preserved detail" in res.text
    assert "- Safe **Markdown** remains useful." in res.text
    assert "<script>" not in res.text
    assert "<img" not in res.text
    assert "&lt;script&gt;alert('unsafe')&lt;/script&gt;" in res.text
    assert "&lt;img src=x onerror=\"alert(1)\"&gt;" in res.text
