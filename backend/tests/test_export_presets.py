"""Tests for export presets functionality."""

import pytest
from arena.core.auth import create_access_token
from arena.db_models import ExportPreset, UserTier


def _make_pro(make_user):
    return make_user(email="pro_presets@example.com", tier=UserTier.PRO)


def _pro_headers(user):
    """Build the Authorization header for a pro-tier user."""
    return {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}


@pytest.fixture
def cleanup_export_presets(db_session, make_user):
    """Clean up export presets after each test."""
    user = _make_pro(make_user)
    db_session.query(ExportPreset).filter(ExportPreset.user_id == user.id).delete()
    db_session.commit()
    return user


@pytest.mark.asyncio
async def test_create_export_preset(app_client, make_user, db_session, cleanup_export_presets):
    """Test creating an export preset."""
    user = cleanup_export_presets
    
    res = await app_client.post(
        "/api/export-presets",
        json={
            "name": "My Bitcoin Exports",
            "format": "csv",
            "search": "Bitcoin",
            "sort": "score",
        },
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "created"
    assert data["name"] == "My Bitcoin Exports"
    assert data["format"] == "csv"
    assert data["search"] == "Bitcoin"
    assert data["sort"] == "score"
    assert "id" in data
    assert "created_at" in data


@pytest.mark.asyncio
async def test_list_export_presets_empty(app_client, make_user, db_session, cleanup_export_presets):
    """Test listing export presets when user has none."""
    user = cleanup_export_presets
    
    res = await app_client.get(
        "/api/export-presets",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["presets"] == []
    assert data["total"] == 0


@pytest.mark.asyncio
async def test_list_export_presets(app_client, make_user, db_session, cleanup_export_presets):
    """Test listing multiple export presets."""
    user = cleanup_export_presets
    
    # Create a few presets
    await app_client.post(
        "/api/export-presets",
        json={"name": "Bitcoin Exports", "format": "csv"},
        headers=_pro_headers(user),
    )
    await app_client.post(
        "/api/export-presets",
        json={"name": "JSON Exports", "format": "json"},
        headers=_pro_headers(user),
    )
    
    res = await app_client.get(
        "/api/export-presets",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 2
    assert len(data["presets"]) == 2
    
    # Should be ordered by updated_at desc (newest first)
    assert data["presets"][0]["name"] == "JSON Exports"
    assert data["presets"][1]["name"] == "Bitcoin Exports"


@pytest.mark.asyncio
async def test_get_export_preset(app_client, make_user, db_session, cleanup_export_presets):
    """Test getting a specific export preset."""
    user = cleanup_export_presets
    
    # Create a preset
    create_res = await app_client.post(
        "/api/export-presets",
        json={"name": "Test Preset", "format": "xlsx", "min_score": 80},
        headers=_pro_headers(user),
    )
    preset_id = create_res.json()["id"]
    
    # Get the preset
    res = await app_client.get(
        f"/api/export-presets/{preset_id}",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["id"] == preset_id
    assert data["name"] == "Test Preset"
    assert data["format"] == "xlsx"
    assert data["min_score"] == 80


@pytest.mark.asyncio
async def test_get_export_preset_not_found(app_client, make_user, db_session, cleanup_export_presets):
    """Test getting a non-existent export preset."""
    user = cleanup_export_presets
    
    res = await app_client.get(
        "/api/export-presets/99999",
        headers=_pro_headers(user),
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_get_export_preset_foreign_user(app_client, make_user, db_session, cleanup_export_presets):
    """Test that users cannot access other users' presets."""
    user = cleanup_export_presets
    
    # Create a preset for the test user
    create_res = await app_client.post(
        "/api/export-presets",
        json={"name": "My Preset"},
        headers=_pro_headers(user),
    )
    preset_id = create_res.json()["id"]
    
    # Try to access with a different user
    other_user = make_user(email="other_presets@example.com", tier=UserTier.PRO)
    db_session.commit()
    
    res = await app_client.get(
        f"/api/export-presets/{preset_id}",
        headers={"Authorization": f"Bearer {create_access_token(other_user.id, other_user.email)}"},
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_update_export_preset(app_client, make_user, db_session, cleanup_export_presets):
    """Test updating an export preset."""
    user = cleanup_export_presets
    
    # Create a preset
    create_res = await app_client.post(
        "/api/export-presets",
        json={"name": "Original Name", "format": "csv"},
        headers=_pro_headers(user),
    )
    preset_id = create_res.json()["id"]
    
    # Update the preset
    res = await app_client.put(
        f"/api/export-presets/{preset_id}",
        json={"name": "Updated Name", "format": "json"},
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "updated"
    assert data["name"] == "Updated Name"
    assert data["format"] == "json"


@pytest.mark.asyncio
async def test_update_export_preset_partial(app_client, make_user, db_session, cleanup_export_presets):
    """Test partial update of export preset."""
    user = cleanup_export_presets
    
    # Create a preset
    create_res = await app_client.post(
        "/api/export-presets",
        json={"name": "Test", "format": "csv", "sort": "newest"},
        headers=_pro_headers(user),
    )
    preset_id = create_res.json()["id"]
    
    # Update only the sort
    res = await app_client.put(
        f"/api/export-presets/{preset_id}",
        json={"sort": "score"},
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["sort"] == "score"
    assert data["format"] == "csv"  # Should remain unchanged
    assert data["name"] == "Test"  # Should remain unchanged


@pytest.mark.asyncio
async def test_delete_export_preset(app_client, make_user, db_session, cleanup_export_presets):
    """Test deleting an export preset."""
    user = cleanup_export_presets
    
    # Create a preset
    create_res = await app_client.post(
        "/api/export-presets",
        json={"name": "To Delete"},
        headers=_pro_headers(user),
    )
    preset_id = create_res.json()["id"]
    
    # Delete the preset
    res = await app_client.delete(
        f"/api/export-presets/{preset_id}",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "deleted"
    assert data["id"] == preset_id
    
    # Verify it's gone
    get_res = await app_client.get(
        f"/api/export-presets/{preset_id}",
        headers=_pro_headers(user),
    )
    assert get_res.status_code == 404


@pytest.mark.asyncio
async def test_delete_export_preset_not_found(app_client, make_user, db_session, cleanup_export_presets):
    """Test deleting a non-existent export preset."""
    user = cleanup_export_presets
    
    res = await app_client.delete(
        "/api/export-presets/99999",
        headers=_pro_headers(user),
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_export_presets_403_for_free_tier(app_client, make_user, db_session):
    """Test that free tier users get 403 for export presets."""
    user = make_user(email="free_presets@example.com", tier=UserTier.FREE)
    db_session.commit()
    
    res = await app_client.post(
        "/api/export-presets",
        json={"name": "Test"},
        headers={"Authorization": f"Bearer {create_access_token(user.id, user.email)}"},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_export_presets_max_limit(app_client, make_user, db_session, cleanup_export_presets):
    """Test that users cannot exceed the preset limit."""
    from arena.routes.export_presets import EXPORT_PRESETS_MAX_PER_USER
    user = cleanup_export_presets
    
    # Manually insert presets directly to avoid rate limiting during test
    for i in range(EXPORT_PRESETS_MAX_PER_USER):
        preset = ExportPreset(
            user_id=user.id,
            name=f"Preset {i}",
            preset_type="saved",
            format="csv",
        )
        db_session.add(preset)
    db_session.commit()
    
    # Try to create one more via API - should fail
    res = await app_client.post(
        "/api/export-presets",
        json={"name": "Over Limit"},
        headers=_pro_headers(user),
    )
    assert res.status_code == 400
    data = res.json()
    assert "preset_limit_reached" in data.get("detail", {}).get("error", "")


@pytest.mark.asyncio
async def test_use_export_preset_redirects(app_client, make_user, db_session, cleanup_export_presets):
    """Test using an export preset redirects to export with preset parameters."""
    user = cleanup_export_presets
    
    # Create a preset
    create_res = await app_client.post(
        "/api/export-presets",
        json={"name": "Test Preset", "format": "json", "search": "Bitcoin", "sort": "score"},
        headers=_pro_headers(user),
    )
    preset_id = create_res.json()["id"]
    
    # Use the preset - should redirect to export endpoint
    res = await app_client.post(
        f"/api/export-presets/{preset_id}/use",
        headers=_pro_headers(user),
        follow_redirects=False,  # Don't follow redirect
    )
    assert res.status_code == 307  # Temporary redirect
    assert "/api/saved/export?" in res.headers["location"]
    assert "format=json" in res.headers["location"]
    assert "search=Bitcoin" in res.headers["location"]
    assert "sort=score" in res.headers["location"]