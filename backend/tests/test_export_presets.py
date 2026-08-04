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
    
    # Check both presets are present (order may vary based on position)
    preset_names = [p["name"] for p in data["presets"]]
    assert "JSON Exports" in preset_names
    assert "Bitcoin Exports" in preset_names
    
    # Check that positions are set correctly (0 and 1)
    preset_positions = [p["position"] for p in data["presets"]]
    assert 0 in preset_positions
    assert 1 in preset_positions


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


# Enhanced Features Tests (added in Loop 19 - POLISH phase)
@pytest.mark.asyncio
async def test_export_preset_position_auto_increment(app_client, make_user, db_session, cleanup_export_presets):
    """Test that presets get auto-incremented positions."""
    user = cleanup_export_presets
    
    # Create first preset - should get position 0
    res1 = await app_client.post(
        "/api/export-presets",
        json={"name": "First"},
        headers=_pro_headers(user),
    )
    assert res1.json()["position"] == 0
    
    # Create second preset - should get position 1
    res2 = await app_client.post(
        "/api/export-presets",
        json={"name": "Second"},
        headers=_pro_headers(user),
    )
    assert res2.json()["position"] == 1
    
    # Create third preset - should get position 2
    res3 = await app_client.post(
        "/api/export-presets",
        json={"name": "Third"},
        headers=_pro_headers(user),
    )
    assert res3.json()["position"] == 2


@pytest.mark.asyncio
async def test_export_preset_default_flag(app_client, make_user, db_session, cleanup_export_presets):
    """Test default preset functionality."""
    user = cleanup_export_presets
    
    # Create first preset as default
    res1 = await app_client.post(
        "/api/export-presets",
        json={"name": "Default Preset", "is_default": True},
        headers=_pro_headers(user),
    )
    assert res1.json()["is_default"] == True
    
    # Create second preset - should not be default
    res2 = await app_client.post(
        "/api/export-presets",
        json={"name": "Regular Preset"},
        headers=_pro_headers(user),
    )
    assert res2.json()["is_default"] == False
    
    # Check that first preset is still default
    res = await app_client.get(
        f"/api/export-presets/{res1.json()['id']}",
        headers=_pro_headers(user),
    )
    assert res.json()["is_default"] == True
    
    # Get default preset endpoint
    default_res = await app_client.get(
        "/api/export-presets/default",
        headers=_pro_headers(user),
    )
    default_data = default_res.json()
    assert default_data is not None, "Default preset should exist"
    assert default_data["id"] == res1.json()["id"]
    
    # Set second preset as default - should un-set first
    update_res = await app_client.put(
        f"/api/export-presets/{res2.json()['id']}",
        json={"is_default": True},
        headers=_pro_headers(user),
    )
    assert update_res.json()["is_default"] == True
    
    # Check that first preset is no longer default
    res = await app_client.get(
        f"/api/export-presets/{res1.json()['id']}",
        headers=_pro_headers(user),
    )
    assert res.json()["is_default"] == False
    
    # Check default endpoint now returns second preset
    default_res2 = await app_client.get(
        "/api/export-presets/default",
        headers=_pro_headers(user),
    )
    default_data2 = default_res2.json()
    assert default_data2 is not None, "Default preset should exist"
    assert default_data2["id"] == res2.json()["id"]


@pytest.mark.asyncio
async def test_export_preset_last_used_at(app_client, make_user, db_session, cleanup_export_presets):
    """Test that last_used_at is updated when preset is used."""
    user = cleanup_export_presets
    
    # Create a preset
    create_res = await app_client.post(
        "/api/export-presets",
        json={"name": "Test Preset"},
        headers=_pro_headers(user),
    )
    preset_id = create_res.json()["id"]
    
    # Check that last_used_at is None initially
    res = await app_client.get(
        f"/api/export-presets/{preset_id}",
        headers=_pro_headers(user),
    )
    assert res.json()["last_used_at"] is None
    
    # Use the preset
    await app_client.post(
        f"/api/export-presets/{preset_id}/use",
        headers=_pro_headers(user),
    )
    
    # Check that last_used_at is now set
    res = await app_client.get(
        f"/api/export-presets/{preset_id}",
        headers=_pro_headers(user),
    )
    assert res.json()["last_used_at"] is not None


@pytest.mark.asyncio
async def test_duplicate_export_preset(app_client, make_user, db_session, cleanup_export_presets):
    """Test duplicating an export preset."""
    user = cleanup_export_presets
    
    # Create original preset
    create_res = await app_client.post(
        "/api/export-presets",
        json={"name": "Original", "format": "json", "position": 5},
        headers=_pro_headers(user),
    )
    original_id = create_res.json()["id"]
    
    # Duplicate the preset
    dup_res = await app_client.post(
        f"/api/export-presets/{original_id}/duplicate",
        headers=_pro_headers(user),
    )
    assert dup_res.status_code == 200
    dup_data = dup_res.json()
    assert dup_data["status"] == "duplicated"
    assert dup_data["original_id"] == original_id
    assert dup_data["new_id"] != original_id
    assert "Copy" in dup_data["name"]
    assert dup_data["position"] == 6  # Should be original position + 1
    assert dup_data["is_default"] == False  # Duplicates are never default
    
    # Verify the duplicated preset has the same settings
    get_res = await app_client.get(
        f"/api/export-presets/{dup_data['new_id']}",
        headers=_pro_headers(user),
    )
    dup_preset = get_res.json()
    assert dup_preset["format"] == "json"


@pytest.mark.asyncio
async def test_reorder_export_presets(app_client, make_user, db_session, cleanup_export_presets):
    """Test reordering export presets."""
    user = cleanup_export_presets
    
    # Create three presets
    preset_ids = []
    for i in range(3):
        res = await app_client.post(
            "/api/export-presets",
            json={"name": f"Preset {i}"},
            headers=_pro_headers(user),
        )
        preset_ids.append(res.json()["id"])
    
    # Reorder them in reverse order
    reorder_body = [
        {"id": preset_ids[2]},  # Third preset -> position 0
        {"id": preset_ids[1]},  # Second preset -> position 1
        {"id": preset_ids[0]},  # First preset -> position 2
    ]
    
    reorder_res = await app_client.post(
        "/api/export-presets/reorder",
        json=reorder_body,
        headers=_pro_headers(user),
    )
    assert reorder_res.status_code == 200
    assert reorder_res.json()["status"] == "reordered"
    assert reorder_res.json()["updated_count"] == 3
    
    # Check the order is updated
    list_res = await app_client.get(
        "/api/export-presets",
        headers=_pro_headers(user),
    )
    presets = list_res.json()["presets"]
    
    # Should be ordered by position ascending
    assert presets[0]["id"] == preset_ids[2]
    assert presets[1]["id"] == preset_ids[1]
    assert presets[2]["id"] == preset_ids[0]
    
    # Check positions are updated
    assert presets[0]["position"] == 0
    assert presets[1]["position"] == 1
    assert presets[2]["position"] == 2


@pytest.mark.asyncio
async def test_export_preset_new_fields_in_response(app_client, make_user, db_session, cleanup_export_presets):
    """Test that new fields (position, is_default, last_used_at, description) are in responses."""
    user = cleanup_export_presets
    
    # Create a preset
    create_res = await app_client.post(
        "/api/export-presets",
        json={"name": "Test"},
        headers=_pro_headers(user),
    )
    preset_id = create_res.json()["id"]
    
    # Check create response has new fields
    data = create_res.json()
    assert "position" in data
    assert "is_default" in data
    assert "last_used_at" in data
    assert "description" in data
    
    # Check list response has new fields
    list_res = await app_client.get(
        "/api/export-presets",
        headers=_pro_headers(user),
    )
    preset_data = list_res.json()["presets"][0]
    assert "position" in preset_data
    assert "is_default" in preset_data
    assert "last_used_at" in preset_data
    assert "description" in preset_data
    
    # Check get response has new fields
    get_res = await app_client.get(
        f"/api/export-presets/{preset_id}",
        headers=_pro_headers(user),
    )
    get_data = get_res.json()
    assert "position" in get_data
    assert "is_default" in get_data
    assert "last_used_at" in get_data
    assert "description" in get_data


@pytest.mark.asyncio
async def test_export_presets_ordered_by_position(app_client, make_user, db_session, cleanup_export_presets):
    """Test that presets are ordered by position then updated_at."""
    user = cleanup_export_presets
    
    # Create presets with specific positions
    await app_client.post(
        "/api/export-presets",
        json={"name": "Zebra", "position": 2},
        headers=_pro_headers(user),
    )
    await app_client.post(
        "/api/export-presets",
        json={"name": "Apple", "position": 0},
        headers=_pro_headers(user),
    )
    await app_client.post(
        "/api/export-presets",
        json={"name": "Mango", "position": 1},
        headers=_pro_headers(user),
    )
    
    # List should be ordered by position
    res = await app_client.get(
        "/api/export-presets",
        headers=_pro_headers(user),
    )
    presets = res.json()["presets"]
    
    assert presets[0]["name"] == "Apple"
    assert presets[0]["position"] == 0
    assert presets[1]["name"] == "Mango"
    assert presets[1]["position"] == 1
    assert presets[2]["name"] == "Zebra"
    assert presets[2]["position"] == 2


# Description field tests (added in Loop 20 - ADD phase)
@pytest.mark.asyncio
async def test_export_preset_description_create(app_client, make_user, db_session, cleanup_export_presets):
    """Test creating an export preset with description."""
    user = cleanup_export_presets
    
    res = await app_client.post(
        "/api/export-presets",
        json={
            "name": "My Bitcoin Exports",
            "description": "Exports all Bitcoin-related responses in CSV format",
            "format": "csv",
            "search": "Bitcoin",
        },
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["description"] == "Exports all Bitcoin-related responses in CSV format"


@pytest.mark.asyncio
async def test_export_preset_description_update(app_client, make_user, db_session, cleanup_export_presets):
    """Test updating an export preset description."""
    user = cleanup_export_presets
    
    # Create preset without description
    create_res = await app_client.post(
        "/api/export-presets",
        json={"name": "Test Preset"},
        headers=_pro_headers(user),
    )
    preset_id = create_res.json()["id"]
    assert create_res.json()["description"] is None
    
    # Update with description
    update_res = await app_client.put(
        f"/api/export-presets/{preset_id}",
        json={"description": "Updated description"},
        headers=_pro_headers(user),
    )
    assert update_res.status_code == 200
    assert update_res.json()["description"] == "Updated description"
    
    # Verify via get
    get_res = await app_client.get(
        f"/api/export-presets/{preset_id}",
        headers=_pro_headers(user),
    )
    assert get_res.json()["description"] == "Updated description"


@pytest.mark.asyncio
async def test_export_preset_description_in_list(app_client, make_user, db_session, cleanup_export_presets):
    """Test that description appears in list response."""
    user = cleanup_export_presets
    
    # Create preset with description
    await app_client.post(
        "/api/export-presets",
        json={"name": "Described Preset", "description": "A preset with description"},
        headers=_pro_headers(user),
    )
    
    # List presets
    list_res = await app_client.get(
        "/api/export-presets",
        headers=_pro_headers(user),
    )
    
    assert list_res.status_code == 200
    presets = list_res.json()["presets"]
    assert len(presets) >= 1
    # Find the preset we created
    described_preset = next((p for p in presets if p["name"] == "Described Preset"), None)
    assert described_preset is not None
    assert described_preset["description"] == "A preset with description"


@pytest.mark.asyncio
async def test_export_preset_description_duplicate(app_client, make_user, db_session, cleanup_export_presets):
    """Test that description is copied when duplicating a preset."""
    user = cleanup_export_presets
    
    # Create original preset with description
    create_res = await app_client.post(
        "/api/export-presets",
        json={"name": "Original", "description": "Original description"},
        headers=_pro_headers(user),
    )
    original_id = create_res.json()["id"]
    
    # Duplicate the preset
    dup_res = await app_client.post(
        f"/api/export-presets/{original_id}/duplicate",
        headers=_pro_headers(user),
    )
    
    assert dup_res.status_code == 200
    dup_data = dup_res.json()
    new_id = dup_data["new_id"]
    
    # Verify the duplicate has the same description
    get_res = await app_client.get(
        f"/api/export-presets/{new_id}",
        headers=_pro_headers(user),
    )
    dup_preset = get_res.json()
    assert dup_preset["description"] == "Original description"


@pytest.mark.asyncio
async def test_export_preset_description_null(app_client, make_user, db_session, cleanup_export_presets):
    """Test that presets without description have null/None description."""
    user = cleanup_export_presets
    
    # Create preset without description
    res = await app_client.post(
        "/api/export-presets",
        json={"name": "No Description"},
        headers=_pro_headers(user),
    )
    
    assert res.status_code == 200
    data = res.json()
    assert data["description"] is None


@pytest.mark.asyncio
async def test_export_preset_description_max_length(app_client, make_user, db_session, cleanup_export_presets):
    """Test that description respects max length of 500 characters."""
    user = cleanup_export_presets
    
    # Create preset with exactly 500 character description
    description_500 = "a" * 500
    res = await app_client.post(
        "/api/export-presets",
        json={"name": "Max Length", "description": description_500},
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    assert res.json()["description"] == description_500
    
    # Try to create preset with 501 character description - should be rejected
    description_501 = "a" * 501
    res = await app_client.post(
        "/api/export-presets",
        json={"name": "Too Long", "description": description_501},
        headers=_pro_headers(user),
    )
    assert res.status_code == 422  # Validation error


@pytest.mark.asyncio
async def test_export_preset_description_empty_string(app_client, make_user, db_session, cleanup_export_presets):
    """Test that empty string description is treated as None."""
    user = cleanup_export_presets
    
    # Create preset with empty string description
    res = await app_client.post(
        "/api/export-presets",
        json={"name": "Empty Desc", "description": ""},
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    # Empty strings may be sanitized to None or kept as empty string depending on sanitize_model_text
    data = res.json()
    assert data["description"] in [None, ""]


@pytest.mark.asyncio
async def test_export_preset_description_update_to_empty(app_client, make_user, db_session, cleanup_export_presets):
    """Test updating description to empty/None."""
    user = cleanup_export_presets
    
    # Create preset with description
    create_res = await app_client.post(
        "/api/export-presets",
        json={"name": "Test", "description": "Has description"},
        headers=_pro_headers(user),
    )
    preset_id = create_res.json()["id"]
    
    # Update to remove description - use empty string (None in request body means "don't change")
    update_res = await app_client.put(
        f"/api/export-presets/{preset_id}",
        json={"description": ""},
        headers=_pro_headers(user),
    )
    assert update_res.status_code == 200
    # Empty string gets sanitized to None
    assert update_res.json()["description"] in [None, ""]


# Search functionality tests (added in Loop 22 - ADD phase)
@pytest.mark.asyncio
async def test_export_presets_search_by_name(app_client, make_user, db_session, cleanup_export_presets):
    """Test searching presets by name."""
    user = cleanup_export_presets
    
    # Create presets with different names
    await app_client.post(
        "/api/export-presets",
        json={"name": "Bitcoin Exports", "description": "For Bitcoin"},
        headers=_pro_headers(user),
    )
    await app_client.post(
        "/api/export-presets",
        json={"name": "Ethereum Exports", "description": "For Ethereum"},
        headers=_pro_headers(user),
    )
    await app_client.post(
        "/api/export-presets",
        json={"name": "Solana Exports", "description": "For Solana"},
        headers=_pro_headers(user),
    )
    
    # Search for Bitcoin
    res = await app_client.get(
        "/api/export-presets?search=Bitcoin",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 1
    assert data["presets"][0]["name"] == "Bitcoin Exports"


@pytest.mark.asyncio
async def test_export_presets_search_by_description(app_client, make_user, db_session, cleanup_export_presets):
    """Test searching presets by description."""
    user = cleanup_export_presets
    
    # Create presets with different descriptions
    await app_client.post(
        "/api/export-presets",
        json={"name": "Preset 1", "description": "Daily export preset"},
        headers=_pro_headers(user),
    )
    await app_client.post(
        "/api/export-presets",
        json={"name": "Preset 2", "description": "Weekly export preset"},
        headers=_pro_headers(user),
    )
    await app_client.post(
        "/api/export-presets",
        json={"name": "Preset 3", "description": "Monthly export preset"},
        headers=_pro_headers(user),
    )
    
    # Search for "export" (appears in all descriptions)
    res = await app_client.get(
        "/api/export-presets?search=export",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 3


@pytest.mark.asyncio
async def test_export_presets_search_case_insensitive(app_client, make_user, db_session, cleanup_export_presets):
    """Test that search is case-insensitive."""
    user = cleanup_export_presets
    
    # Create preset with lowercase name
    await app_client.post(
        "/api/export-presets",
        json={"name": "bitcoin exports", "description": "for bitcoin"},
        headers=_pro_headers(user),
    )
    
    # Search with uppercase
    res = await app_client.get(
        "/api/export-presets?search=BITCOIN",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 1
    assert data["presets"][0]["name"] == "bitcoin exports"


@pytest.mark.asyncio
async def test_export_presets_search_no_results(app_client, make_user, db_session, cleanup_export_presets):
    """Test search with no matching results."""
    user = cleanup_export_presets
    
    # Create a preset
    await app_client.post(
        "/api/export-presets",
        json={"name": "Bitcoin Exports"},
        headers=_pro_headers(user),
    )
    
    # Search for something that doesn't exist
    res = await app_client.get(
        "/api/export-presets?search=NonExistent",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 0
    assert data["presets"] == []


@pytest.mark.asyncio
async def test_export_presets_search_partial_match(app_client, make_user, db_session, cleanup_export_presets):
    """Test that search performs partial matching."""
    user = cleanup_export_presets
    
    # Create preset
    await app_client.post(
        "/api/export-presets",
        json={"name": "Bitcoin Price Analysis"},
        headers=_pro_headers(user),
    )
    
    # Search for partial match
    res = await app_client.get(
        "/api/export-presets?search=Price",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 1
    assert data["presets"][0]["name"] == "Bitcoin Price Analysis"


# Filter tests (added in Loop 23 - POLISH phase)
@pytest.mark.asyncio
async def test_export_presets_filter_by_format(app_client, make_user, db_session, cleanup_export_presets):
    """Test filtering presets by format."""
    user = cleanup_export_presets
    
    # Create presets with different formats
    await app_client.post(
        "/api/export-presets",
        json={"name": "CSV Preset", "format": "csv"},
        headers=_pro_headers(user),
    )
    await app_client.post(
        "/api/export-presets",
        json={"name": "JSON Preset", "format": "json"},
        headers=_pro_headers(user),
    )
    await app_client.post(
        "/api/export-presets",
        json={"name": "XLSX Preset", "format": "xlsx"},
        headers=_pro_headers(user),
    )
    
    # Filter by csv format
    res = await app_client.get(
        "/api/export-presets?format=csv",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 1
    assert data["presets"][0]["name"] == "CSV Preset"


@pytest.mark.asyncio
async def test_export_presets_filter_by_preset_type(app_client, make_user, db_session, cleanup_export_presets):
    """Test filtering presets by preset_type."""
    user = cleanup_export_presets
    
    # Create presets with different types
    await app_client.post(
        "/api/export-presets",
        json={"name": "Saved Preset", "preset_type": "saved"},
        headers=_pro_headers(user),
    )
    await app_client.post(
        "/api/export-presets",
        json={"name": "Session Preset", "preset_type": "sessions"},
        headers=_pro_headers(user),
    )
    
    # Filter by saved type
    res = await app_client.get(
        "/api/export-presets?preset_type=saved",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 1
    assert data["presets"][0]["name"] == "Saved Preset"


@pytest.mark.asyncio
async def test_export_presets_combined_filters(app_client, make_user, db_session, cleanup_export_presets):
    """Test combining search and format filters."""
    user = cleanup_export_presets
    
    # Create various presets
    await app_client.post(
        "/api/export-presets",
        json={"name": "Bitcoin CSV", "format": "csv", "description": "Bitcoin exports in CSV"},
        headers=_pro_headers(user),
    )
    await app_client.post(
        "/api/export-presets",
        json={"name": "Bitcoin JSON", "format": "json", "description": "Bitcoin exports in JSON"},
        headers=_pro_headers(user),
    )
    await app_client.post(
        "/api/export-presets",
        json={"name": "Ethereum CSV", "format": "csv", "description": "Ethereum exports in CSV"},
        headers=_pro_headers(user),
    )
    
    # Search for Bitcoin AND filter by csv format
    res = await app_client.get(
        "/api/export-presets?search=Bitcoin&format=csv",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 1
    assert data["presets"][0]["name"] == "Bitcoin CSV"


@pytest.mark.asyncio
async def test_export_presets_filter_no_match(app_client, make_user, db_session, cleanup_export_presets):
    """Test filter with no matching results."""
    user = cleanup_export_presets
    
    # Create only json presets
    await app_client.post(
        "/api/export-presets",
        json={"name": "JSON Preset", "format": "json"},
        headers=_pro_headers(user),
    )
    
    # Filter by csv (no matches)
    res = await app_client.get(
        "/api/export-presets?format=csv",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 0
    assert data["presets"] == []


@pytest.mark.asyncio
async def test_export_presets_search_sanitization(app_client, make_user, db_session, cleanup_export_presets):
    """Test that search input is properly sanitized."""
    user = cleanup_export_presets
    
    # Create a preset
    await app_client.post(
        "/api/export-presets",
        json={"name": "Test Preset"},
        headers=_pro_headers(user),
    )
    
    # Search with potentially problematic input (should be sanitized)
    res = await app_client.get(
        "/api/export-presets?search=<script>alert('xss')</script>",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    # Should not cause any errors and should handle the input safely
    data = res.json()
    assert "presets" in data


# Bulk delete tests (added in Loop 24 - ADD phase)
@pytest.mark.asyncio
async def test_bulk_delete_export_presets(app_client, make_user, db_session, cleanup_export_presets):
    """Test bulk deleting multiple export presets."""
    user = cleanup_export_presets
    
    # Create multiple presets
    preset_ids = []
    for i in range(5):
        res = await app_client.post(
            "/api/export-presets",
            json={"name": f"Bulk Preset {i}"},
            headers=_pro_headers(user),
        )
        preset_ids.append(res.json()["id"])
    
    # Bulk delete them
    res = await app_client.post(
        "/api/export-presets/bulk-delete",
        json={"ids": preset_ids},
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "bulk_deleted"
    assert data["deleted_count"] == 5
    assert len(data["deleted_ids"]) == 5
    
    # Verify they are actually deleted
    list_res = await app_client.get(
        "/api/export-presets",
        headers=_pro_headers(user),
    )
    assert list_res.json()["total"] == 0


@pytest.mark.asyncio
async def test_bulk_delete_export_presets_partial(app_client, make_user, db_session, cleanup_export_presets):
    """Test bulk delete with some valid and some invalid IDs."""
    user = cleanup_export_presets
    
    # Create 3 presets
    preset_ids = []
    for i in range(3):
        res = await app_client.post(
            "/api/export-presets",
            json={"name": f"Partial Preset {i}"},
            headers=_pro_headers(user),
        )
        preset_ids.append(res.json()["id"])
    
    # Bulk delete with some valid and some invalid IDs
    # preset_ids[0] and preset_ids[1] are valid, 99999 and 99998 don't exist
    res = await app_client.post(
        "/api/export-presets/bulk-delete",
        json={"ids": [preset_ids[0], preset_ids[1], 99999, 99998]},
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["deleted_count"] == 2
    assert data["not_found_count"] == 2
    assert len(data["not_found_ids"]) == 2
    assert 99999 in data["not_found_ids"]
    assert 99998 in data["not_found_ids"]


@pytest.mark.asyncio
async def test_bulk_delete_export_presets_foreign_user(app_client, make_user, db_session, cleanup_export_presets):
    """Test that bulk delete doesn't delete other users' presets."""
    user = cleanup_export_presets
    
    # Create a preset for the test user
    res1 = await app_client.post(
        "/api/export-presets",
        json={"name": "My Preset"},
        headers=_pro_headers(user),
    )
    my_preset_id = res1.json()["id"]
    
    # Create another user with a preset
    other_user = make_user(email="other_bulk@example.com", tier=UserTier.PRO)
    db_session.commit()
    
    res2 = await app_client.post(
        "/api/export-presets",
        json={"name": "Other User Preset"},
        headers={"Authorization": f"Bearer {create_access_token(other_user.id, other_user.email)}"},
    )
    other_preset_id = res2.json()["id"]
    
    # Try to bulk delete both presets as the first user
    # Should only delete my_preset_id, not other_preset_id
    res = await app_client.post(
        "/api/export-presets/bulk-delete",
        json={"ids": [my_preset_id, other_preset_id]},
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["deleted_count"] == 1
    assert data["foreign_count"] == 1
    assert my_preset_id in data["deleted_ids"]
    assert other_preset_id in data["foreign_ids"]
    
    # Verify the other user's preset still exists
    get_res = await app_client.get(
        f"/api/export-presets/{other_preset_id}",
        headers={"Authorization": f"Bearer {create_access_token(other_user.id, other_user.email)}"},
    )
    assert get_res.status_code == 200


@pytest.mark.asyncio
async def test_bulk_delete_export_presets_empty_list(app_client, make_user, db_session, cleanup_export_presets):
    """Test bulk delete with empty list (should be rejected by Pydantic)."""
    user = cleanup_export_presets
    
    res = await app_client.post(
        "/api/export-presets/bulk-delete",
        json={"ids": []},
        headers=_pro_headers(user),
    )
    # Pydantic validation should reject empty list
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_bulk_delete_export_presets_too_many(app_client, make_user, db_session, cleanup_export_presets):
    """Test bulk delete with too many IDs (should be rejected by Pydantic)."""
    user = cleanup_export_presets
    
    # Try to delete 51 presets (max is 50)
    res = await app_client.post(
        "/api/export-presets/bulk-delete",
        json={"ids": list(range(1, 52))},
        headers=_pro_headers(user),
    )
    # Pydantic validation should reject
    assert res.status_code == 422
