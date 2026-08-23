"""Tests for export presets functionality."""

import pytest
from arena.core.auth import create_access_token
from arena.core.datetime_utils import utcnow_naive
from arena.db_models import ExportPreset, SavedResponse, UserTier


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
async def test_duplicate_export_preset_preserves_max_score(app_client, make_user, db_session, cleanup_export_presets):
    """Test that duplicating a preset preserves the max_score filter."""
    user = cleanup_export_presets

    create_res = await app_client.post(
        "/api/export-presets",
        json={"name": "Original", "format": "json", "min_score": 50, "max_score": 80},
        headers=_pro_headers(user),
    )
    original_id = create_res.json()["id"]

    dup_res = await app_client.post(
        f"/api/export-presets/{original_id}/duplicate",
        headers=_pro_headers(user),
    )
    assert dup_res.status_code == 200

    get_res = await app_client.get(
        f"/api/export-presets/{dup_res.json()['new_id']}",
        headers=_pro_headers(user),
    )
    dup_preset = get_res.json()
    assert dup_preset["min_score"] == 50
    assert dup_preset["max_score"] == 80


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
        json={"items": reorder_body},
        headers=_pro_headers(user),
    )
    assert reorder_res.status_code == 200
    assert reorder_res.json()["status"] == "reordered"
    assert reorder_res.json()["updated_count"] == 3

    # Reorder again with a foreign preset mixed in - only owned presets count
    foreign_user = make_user(email="pro_presets_foreign@example.com", tier=UserTier.PRO)
    foreign_res = await app_client.post(
        "/api/export-presets",
        json={"name": "Foreign Preset"},
        headers=_pro_headers(foreign_user),
    )
    foreign_id = foreign_res.json()["id"]

    reorder_res = await app_client.post(
        "/api/export-presets/reorder",
        json={"items": [{"id": preset_ids[2]}, {"id": preset_ids[1]}, {"id": preset_ids[0]}, {"id": foreign_id}]},
        headers=_pro_headers(user),
    )
    assert reorder_res.status_code == 200
    assert reorder_res.json()["updated_count"] == 3

    # Remove the foreign preset so it doesn't affect the owned list below
    db_session.query(ExportPreset).filter(ExportPreset.id == foreign_id).delete()
    db_session.commit()

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


# Default preset protection tests (added in Loop 25 - POLISH phase)
@pytest.mark.asyncio
async def test_bulk_delete_protected_default_preset(app_client, make_user, db_session, cleanup_export_presets):
    """Test that bulk delete protects default presets without force flag."""
    user = cleanup_export_presets

    # Create a preset and set it as default
    res1 = await app_client.post(
        "/api/export-presets",
        json={"name": "Default Preset", "is_default": True},
        headers=_pro_headers(user),
    )
    default_id = res1.json()["id"]

    # Create another preset
    res2 = await app_client.post(
        "/api/export-presets",
        json={"name": "Regular Preset"},
        headers=_pro_headers(user),
    )
    regular_id = res2.json()["id"]

    # Try to bulk delete both (without force) - should fail
    res = await app_client.post(
        "/api/export-presets/bulk-delete",
        json={"ids": [default_id, regular_id]},
        headers=_pro_headers(user),
    )
    assert res.status_code == 400
    data = res.json()
    assert data["detail"]["error"] == "default_preset_protected"
    assert default_id in data["detail"]["protected_ids"]

    # Verify no presets were deleted
    list_res = await app_client.get(
        "/api/export-presets",
        headers=_pro_headers(user),
    )
    assert list_res.json()["total"] == 2


@pytest.mark.asyncio
async def test_bulk_delete_default_preset_with_force(app_client, make_user, db_session, cleanup_export_presets):
    """Test that bulk delete allows deleting default preset with force=true."""
    user = cleanup_export_presets

    # Create a preset and set it as default
    res1 = await app_client.post(
        "/api/export-presets",
        json={"name": "Default Preset", "is_default": True},
        headers=_pro_headers(user),
    )
    default_id = res1.json()["id"]

    # Create another preset
    res2 = await app_client.post(
        "/api/export-presets",
        json={"name": "Regular Preset"},
        headers=_pro_headers(user),
    )
    regular_id = res2.json()["id"]

    # Bulk delete both with force=true - should succeed
    res = await app_client.post(
        "/api/export-presets/bulk-delete",
        json={"ids": [default_id, regular_id], "force": True},
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["deleted_count"] == 2
    assert default_id in data["deleted_ids"]
    assert regular_id in data["deleted_ids"]

    # Verify both presets were deleted
    list_res = await app_client.get(
        "/api/export-presets",
        headers=_pro_headers(user),
    )
    assert list_res.json()["total"] == 0


@pytest.mark.asyncio
async def test_bulk_delete_force_default_false(app_client, make_user, db_session, cleanup_export_presets):
    """Test that force=false (or omitted) still protects default preset."""
    user = cleanup_export_presets

    # Create a default preset
    res = await app_client.post(
        "/api/export-presets",
        json={"name": "Default Preset", "is_default": True},
        headers=_pro_headers(user),
    )
    default_id = res.json()["id"]

    # Try to delete with force=false - should still fail
    res = await app_client.post(
        "/api/export-presets/bulk-delete",
        json={"ids": [default_id], "force": False},
        headers=_pro_headers(user),
    )
    assert res.status_code == 400
    assert res.json()["detail"]["error"] == "default_preset_protected"


# Export/Import tests (added in Loop 26 - ADD phase)
@pytest.mark.asyncio
async def test_export_presets_export_all(app_client, make_user, db_session, cleanup_export_presets):
    """Test exporting all presets as JSON."""
    user = cleanup_export_presets

    # Create some presets
    await app_client.post(
        "/api/export-presets",
        json={"name": "Preset 1", "description": "First preset", "format": "csv"},
        headers=_pro_headers(user),
    )
    await app_client.post(
        "/api/export-presets",
        json={"name": "Preset 2", "description": "Second preset", "format": "json"},
        headers=_pro_headers(user),
    )

    # Export all presets
    res = await app_client.get(
        "/api/export-presets/export",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "exported"
    assert data["user_id"] == user.id
    assert data["total_presets"] == 2
    assert len(data["presets"]) == 2

    # Verify preset data is correct
    preset_names = [p["name"] for p in data["presets"]]
    assert "Preset 1" in preset_names
    assert "Preset 2" in preset_names


@pytest.mark.asyncio
async def test_export_presets_export_empty(app_client, make_user, db_session, cleanup_export_presets):
    """Test exporting when user has no presets."""
    user = cleanup_export_presets

    # Export with no presets
    res = await app_client.get(
        "/api/export-presets/export",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "exported"
    assert data["total_presets"] == 0
    assert data["presets"] == []


@pytest.mark.asyncio
async def test_export_presets_import_basic(app_client, make_user, db_session, cleanup_export_presets):
    """Test importing presets from JSON."""
    user = cleanup_export_presets

    # Import presets
    res = await app_client.post(
        "/api/export-presets/import",
        json={
            "presets": [
                {"name": "Imported Preset 1", "format": "csv", "search": "Bitcoin"},
                {"name": "Imported Preset 2", "format": "json", "sort": "score"},
            ]
        },
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "imported"
    assert data["imported_count"] == 2
    assert data["skipped_count"] == 0
    assert len(data["imported_ids"]) == 2

    # Verify presets were created
    list_res = await app_client.get(
        "/api/export-presets",
        headers=_pro_headers(user),
    )
    assert list_res.json()["total"] == 2


@pytest.mark.asyncio
async def test_export_presets_import_with_limit(app_client, make_user, db_session, cleanup_export_presets):
    """Test that import respects the preset limit."""
    from arena.routes.export_presets import EXPORT_PRESETS_MAX_PER_USER
    user = cleanup_export_presets

    # Manually insert presets up to the limit
    for i in range(EXPORT_PRESETS_MAX_PER_USER):
        preset = ExportPreset(
            user_id=user.id,
            name=f"Preset {i}",
            preset_type="saved",
            format="csv",
        )
        db_session.add(preset)
    db_session.commit()

    # Try to import more presets - should fail
    res = await app_client.post(
        "/api/export-presets/import",
        json={"presets": [{"name": "Extra Preset"}]},
        headers=_pro_headers(user),
    )
    assert res.status_code == 400
    assert "preset_limit_reached" in res.json()["detail"]["error"]


@pytest.mark.asyncio
async def test_export_import_roundtrip(app_client, make_user, db_session, cleanup_export_presets):
    """Test that exported presets can be re-imported."""
    user = cleanup_export_presets

    # Create some presets
    original_presets = [
        {"name": "Roundtrip Preset 1", "description": "Description for Roundtrip Preset 1", "min_score": 40, "max_score": 70},
        {"name": "Roundtrip Preset 2", "description": "Description for Roundtrip Preset 2", "format": "json", "search": "Bitcoin"},
    ]
    for preset_data in original_presets:
        await app_client.post(
            "/api/export-presets",
            json=preset_data,
            headers=_pro_headers(user),
        )

    # Export all presets
    export_res = await app_client.get(
        "/api/export-presets/export",
        headers=_pro_headers(user),
    )
    exported_data = export_res.json()
    assert "version" in exported_data

    # Get all preset IDs to delete them
    list_res_before = await app_client.get(
        "/api/export-presets",
        headers=_pro_headers(user),
    )
    preset_ids = [p["id"] for p in list_res_before.json()["presets"]]

    # Delete all presets
    await app_client.post(
        "/api/export-presets/bulk-delete",
        json={"ids": preset_ids, "force": True},
        headers=_pro_headers(user),
    )

    # Verify all deleted
    list_res = await app_client.get(
        "/api/export-presets",
        headers=_pro_headers(user),
    )
    assert list_res.json()["total"] == 0

    # Re-import the exported presets
    import_res = await app_client.post(
        "/api/export-presets/import",
        json={"presets": exported_data["presets"]},
        headers=_pro_headers(user),
    )
    assert import_res.status_code == 200
    assert import_res.json()["imported_count"] == 2

    # Verify presets were restored
    list_res = await app_client.get(
        "/api/export-presets",
        headers=_pro_headers(user),
    )
    assert list_res.json()["total"] == 2
    restored_names = [p["name"] for p in list_res.json()["presets"]]
    for preset_data in original_presets:
        assert preset_data["name"] in restored_names

    # Verify max_score survived the export/import roundtrip
    restored_presets = {p["name"]: p for p in list_res.json()["presets"]}
    assert restored_presets["Roundtrip Preset 1"]["min_score"] == 40
    assert restored_presets["Roundtrip Preset 1"]["max_score"] == 70
    assert restored_presets["Roundtrip Preset 2"]["format"] == "json"
    assert restored_presets["Roundtrip Preset 2"]["search"] == "Bitcoin"


@pytest.mark.asyncio
async def test_export_presets_import_duplicate_names(app_client, make_user, db_session, cleanup_export_presets):
    """Test that importing presets with duplicate names appends a suffix."""
    user = cleanup_export_presets

    # Create a preset with a specific name
    await app_client.post(
        "/api/export-presets",
        json={"name": "My Preset"},
        headers=_pro_headers(user),
    )

    # Import a preset with the same name
    from datetime import datetime
    today_str = datetime.utcnow().strftime('%Y%m%d')

    res = await app_client.post(
        "/api/export-presets/import",
        json={"presets": [{"name": "My Preset"}]},
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["imported_count"] == 1
    assert "My Preset" in data["duplicated_names"]

    # Verify the imported preset has a modified name
    list_res = await app_client.get(
        "/api/export-presets",
        headers=_pro_headers(user),
    )
    presets = list_res.json()["presets"]
    assert len(presets) == 2

    # One should be "My Preset" (original) and one should have the suffix
    names = [p["name"] for p in presets]
    assert "My Preset" in names
    # The duplicate should have the imported suffix
    imported_name = f"My Preset (Imported {today_str})"
    assert imported_name in names


@pytest.mark.asyncio
async def test_export_presets_import_version_metadata(app_client, make_user, db_session, cleanup_export_presets):
    """Test that export includes version metadata."""
    user = cleanup_export_presets

    # Create a preset
    await app_client.post(
        "/api/export-presets",
        json={"name": "Test Preset"},
        headers=_pro_headers(user),
    )

    # Export presets
    res = await app_client.get(
        "/api/export-presets/export",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert "version" in data
    assert data["version"] == "1.0"


# Template tests (added in Loop 28 - ADD phase)
@pytest.mark.asyncio
async def test_list_export_preset_templates(app_client, make_user, db_session, cleanup_export_presets):
    """Test listing available preset templates."""
    user = cleanup_export_presets

    res = await app_client.get(
        "/api/export-presets/templates",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert "templates" in data
    assert len(data["templates"]) > 0
    assert data["total"] > 0

    # Verify template structure
    for template in data["templates"]:
        assert "id" in template
        assert "name" in template
        assert "description" in template
        assert "format" in template


@pytest.mark.asyncio
async def test_create_preset_from_template(app_client, make_user, db_session, cleanup_export_presets):
    """Test creating a preset from a template."""
    user = cleanup_export_presets

    # Create preset from high_score template
    res = await app_client.post(
        "/api/export-presets/from-template?template_id=high_score",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "created_from_template"
    assert data["template_id"] == "high_score"
    assert "High Score" in data["name"]
    assert data["min_score"] == 80
    assert data["format"] == "csv"
    assert data["sort"] == "score"

    # Verify the preset was actually created
    list_res = await app_client.get(
        "/api/export-presets",
        headers=_pro_headers(user),
    )
    assert list_res.json()["total"] == 1


@pytest.mark.asyncio
async def test_create_preset_from_nonexistent_template(app_client, make_user, db_session, cleanup_export_presets):
    """Test creating a preset from a non-existent template."""
    user = cleanup_export_presets

    res = await app_client.post(
        "/api/export-presets/from-template?template_id=nonexistent",
        headers=_pro_headers(user),
    )
    assert res.status_code == 404
    assert res.json()["detail"]["error"] == "template_not_found"


@pytest.mark.asyncio
async def test_create_preset_from_template_at_limit(app_client, make_user, db_session, cleanup_export_presets):
    """Test that creating from template respects the preset limit."""
    from arena.routes.export_presets import EXPORT_PRESETS_MAX_PER_USER
    user = cleanup_export_presets

    # Manually insert presets up to the limit
    for i in range(EXPORT_PRESETS_MAX_PER_USER):
        preset = ExportPreset(
            user_id=user.id,
            name=f"Preset {i}",
            preset_type="saved",
            format="csv",
        )
        db_session.add(preset)
    db_session.commit()

    # Try to create from template - should fail
    res = await app_client.post(
        "/api/export-presets/from-template?template_id=high_score",
        headers=_pro_headers(user),
    )
    assert res.status_code == 400
    assert "preset_limit_reached" in res.json()["detail"]["error"]


@pytest.mark.asyncio
async def test_create_preset_from_template_with_custom_name(app_client, make_user, db_session, cleanup_export_presets):
    """Test creating a preset from a template with a custom name override."""
    user = cleanup_export_presets

    # Create preset from template with custom name
    custom_name = "My Custom High Score Preset"
    res = await app_client.post(
        "/api/export-presets/from-template",
        params={"template_id": "high_score", "name": custom_name},
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "created_from_template"
    assert data["name"] == custom_name
    assert data["template_id"] == "high_score"
    assert data["min_score"] == 80
    assert data["format"] == "csv"

    # Verify the preset was created with the custom name
    list_res = await app_client.get(
        "/api/export-presets",
        headers=_pro_headers(user),
    )
    presets = list_res.json()["presets"]
    assert len(presets) == 1
    assert presets[0]["name"] == custom_name


@pytest.mark.asyncio
async def test_create_preset_from_template_without_custom_name(app_client, make_user, db_session, cleanup_export_presets):
    """Test creating a preset from a template without custom name generates timestamp-suffixed name."""
    user = cleanup_export_presets

    # Create preset from template without custom name
    res = await app_client.post(
        "/api/export-presets/from-template?template_id=high_score",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "created_from_template"
    assert data["template_id"] == "high_score"
    assert "High Score Responses" in data["name"]
    # Name should have timestamp suffix
    assert "(" in data["name"] and ")" in data["name"]
    assert len(data["name"]) > len("High Score Responses")


@pytest.mark.asyncio
async def test_create_preset_from_template_all_templates(app_client, make_user, db_session, cleanup_export_presets):
    """Test that all template IDs are valid and can create presets."""
    user = cleanup_export_presets

    template_ids = ["high_score", "recent", "bitcoin_all", "high_score_json", "all_responses",
                   "ethereum_all", "top_scoring", "low_score", "medium_score"]

    for template_id in template_ids:
        res = await app_client.post(
            "/api/export-presets/from-template",
            params={"template_id": template_id},
            headers=_pro_headers(user),
        )
        assert res.status_code == 200, f"Failed for template {template_id}"
        data = res.json()
        assert data["status"] == "created_from_template"
        assert data["template_id"] == template_id

    # Verify all presets were created
    list_res = await app_client.get(
        "/api/export-presets",
        headers=_pro_headers(user),
    )
    assert list_res.json()["total"] == len(template_ids)


@pytest.mark.asyncio
async def test_create_preset_from_template_uses_custom_name(app_client, make_user, db_session, cleanup_export_presets):
    """Test that custom name is used exactly as provided (after basic sanitization)."""
    user = cleanup_export_presets

    # Create with a specific custom name
    custom_name = "My Special Preset"
    res = await app_client.post(
        "/api/export-presets/from-template",
        params={"template_id": "high_score", "name": custom_name},
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    # The name should be exactly what we provided
    assert data["name"] == custom_name

    # Also test with whitespace that should be stripped
    custom_name_with_spaces = "  My Preset  "
    res2 = await app_client.post(
        "/api/export-presets/from-template",
        params={"template_id": "recent", "name": custom_name_with_spaces},
        headers=_pro_headers(user),
    )
    assert res2.status_code == 200
    data2 = res2.json()
    # Whitespace should be stripped
    assert data2["name"] == "My Preset"


@pytest.mark.asyncio
async def test_create_export_preset_with_max_score(app_client, make_user, db_session, cleanup_export_presets):
    """Test creating an export preset with max_score."""
    user = cleanup_export_presets

    res = await app_client.post(
        "/api/export-presets",
        json={
            "name": "Medium Score Responses",
            "format": "csv",
            "min_score": 50,
            "max_score": 80,
            "sort": "score",
        },
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "created"
    assert data["name"] == "Medium Score Responses"
    assert data["min_score"] == 50
    assert data["max_score"] == 80


@pytest.mark.asyncio
async def test_update_clears_search_with_blank_string(app_client, make_user, db_session, cleanup_export_presets):
    """An explicitly blank search term clears the filter instead of erroring."""
    user = cleanup_export_presets

    create_res = await app_client.post(
        "/api/export-presets",
        json={"name": "Searchy", "format": "csv", "search": "bitcoin"},
        headers=_pro_headers(user),
    )
    preset_id = create_res.json()["id"]
    assert create_res.json()["search"] == "bitcoin"

    res = await app_client.put(
        f"/api/export-presets/{preset_id}",
        json={"search": ""},
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    assert res.json()["status"] == "updated"
    assert res.json()["search"] is None


@pytest.mark.asyncio
async def test_update_clears_score_bounds_with_explicit_nulls(app_client, make_user, db_session, cleanup_export_presets):
    """Explicit null score bounds remove the filters; absent ones leave them."""
    user = cleanup_export_presets

    create_res = await app_client.post(
        "/api/export-presets",
        json={"name": "Bounded", "format": "csv", "min_score": 40, "max_score": 90},
        headers=_pro_headers(user),
    )
    preset_id = create_res.json()["id"]

    # Omitting the fields entirely must not touch them.
    partial_res = await app_client.put(
        f"/api/export-presets/{preset_id}",
        json={"name": "Bounded Renamed"},
        headers=_pro_headers(user),
    )
    assert partial_res.status_code == 200
    assert partial_res.json()["min_score"] == 40
    assert partial_res.json()["max_score"] == 90

    # Explicit nulls clear them.
    clear_res = await app_client.put(
        f"/api/export-presets/{preset_id}",
        json={"min_score": None, "max_score": None},
        headers=_pro_headers(user),
    )
    assert clear_res.status_code == 200
    assert clear_res.json()["min_score"] is None
    assert clear_res.json()["max_score"] is None


@pytest.mark.asyncio
async def test_update_trims_and_keeps_nonblank_search(app_client, make_user, db_session, cleanup_export_presets):
    """A padded but non-blank term is still sanitized, not treated as clear."""
    user = cleanup_export_presets

    create_res = await app_client.post(
        "/api/export-presets",
        json={"name": "Trimmy", "format": "csv"},
        headers=_pro_headers(user),
    )
    preset_id = create_res.json()["id"]

    res = await app_client.put(
        f"/api/export-presets/{preset_id}",
        json={"search": "  ethereum merge  "},
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    assert res.json()["search"] == "ethereum merge"


@pytest.mark.asyncio
async def test_update_export_preset_max_score(app_client, make_user, db_session, cleanup_export_presets):
    """Test updating an export preset max_score."""
    user = cleanup_export_presets

    # Create a preset
    create_res = await app_client.post(
        "/api/export-presets",
        json={"name": "Test Preset", "format": "csv"},
        headers=_pro_headers(user),
    )
    assert create_res.status_code == 200
    preset_id = create_res.json()["id"]

    # Update with max_score
    update_res = await app_client.put(
        f"/api/export-presets/{preset_id}",
        json={"max_score": 75},
        headers=_pro_headers(user),
    )
    assert update_res.status_code == 200
    data = update_res.json()
    assert data["status"] == "updated"
    assert data["max_score"] == 75


@pytest.mark.asyncio
async def test_create_preset_from_template_with_max_score(app_client, make_user, db_session, cleanup_export_presets):
    """Test creating a preset from the low_score template which has max_score=49."""
    user = cleanup_export_presets

    res = await app_client.post(
        "/api/export-presets/from-template?template_id=low_score",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "created_from_template"
    assert data["template_id"] == "low_score"
    assert data["max_score"] == 49
    assert data["min_score"] is None


@pytest.mark.asyncio
async def test_list_export_presets_includes_max_score(app_client, make_user, db_session, cleanup_export_presets):
    """Test that list endpoint includes max_score in response."""
    user = cleanup_export_presets

    # Create preset with max_score
    await app_client.post(
        "/api/export-presets",
        json={"name": "Test Preset", "format": "csv", "max_score": 90},
        headers=_pro_headers(user),
    )

    # List presets
    res = await app_client.get(
        "/api/export-presets",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 1
    assert data["presets"][0]["max_score"] == 90


@pytest.mark.asyncio
async def test_create_preset_invalid_score_range(app_client, make_user, db_session, cleanup_export_presets):
    """Test that creating a preset with min_score > max_score fails."""
    user = cleanup_export_presets

    res = await app_client.post(
        "/api/export-presets",
        json={
            "name": "Invalid Range",
            "format": "csv",
            "min_score": 80,
            "max_score": 50,
        },
        headers=_pro_headers(user),
    )
    assert res.status_code == 422  # Validation error
    assert "max_score must be greater than or equal to min_score" in res.text


@pytest.mark.asyncio
async def test_update_preset_invalid_score_range(app_client, make_user, db_session, cleanup_export_presets):
    """Test that updating a preset with min_score > max_score fails."""
    user = cleanup_export_presets

    # Create a preset first
    create_res = await app_client.post(
        "/api/export-presets",
        json={"name": "Test Preset", "format": "csv"},
        headers=_pro_headers(user),
    )
    preset_id = create_res.json()["id"]

    # Try to update with invalid range
    res = await app_client.put(
        f"/api/export-presets/{preset_id}",
        json={"min_score": 80, "max_score": 50},
        headers=_pro_headers(user),
    )
    assert res.status_code == 422
    assert "max_score must be greater than or equal to min_score" in res.text


@pytest.mark.asyncio
async def test_create_preset_from_medium_score_template(app_client, make_user, db_session, cleanup_export_presets):
    """Test creating a preset from the medium_score template which has both min and max."""
    user = cleanup_export_presets

    res = await app_client.post(
        "/api/export-presets/from-template?template_id=medium_score",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "created_from_template"
    assert data["template_id"] == "medium_score"
    assert data["min_score"] == 50
    assert data["max_score"] == 80


@pytest.mark.asyncio
async def test_list_export_presets_filter_by_max_score(app_client, make_user, db_session, cleanup_export_presets):
    """Test filtering presets by max_score."""
    user = cleanup_export_presets

    # Create presets with different max_scores
    await app_client.post(
        "/api/export-presets",
        json={"name": "Preset 1", "format": "csv", "max_score": 50},
        headers=_pro_headers(user),
    )
    await app_client.post(
        "/api/export-presets",
        json={"name": "Preset 2", "format": "csv", "max_score": 80},
        headers=_pro_headers(user),
    )
    await app_client.post(
        "/api/export-presets",
        json={"name": "Preset 3", "format": "csv"},
        headers=_pro_headers(user),
    )

    # Filter by max_score=50
    res = await app_client.get(
        "/api/export-presets?max_score=50",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 1
    assert data["presets"][0]["name"] == "Preset 1"
    assert data["presets"][0]["max_score"] == 50


# ─── Export preset preview (dry run) ────────────────────────────────────────


def _seed_saved(
    db_session,
    user_id,
    saved_id,
    *,
    prompt="Test prompt",
    one_liner="Test answer",
    score=85,
    persona_id=None,
    saved_at=None,
):
    """Seed a SavedResponse row owned by user_id (fresh per-test DB)."""
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
        saved_at=saved_at if saved_at is not None else utcnow_naive(),
    )
    db_session.add(saved)
    db_session.flush()
    return saved


async def _create_preset(app_client, user, **overrides):
    body = {"name": "Preview Preset", "format": "csv"}
    body.update(overrides)
    res = await app_client.post(
        "/api/export-presets",
        json=body,
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    return res.json()["id"]


@pytest.mark.asyncio
async def test_preview_counts_and_samples_using_preset_filters(
    app_client, make_user, db_session, cleanup_export_presets
):
    """Preview returns the exact match count + sample for the preset's filters."""
    user = cleanup_export_presets
    _seed_saved(db_session, user.id, "s1", prompt="Bitcoin question", score=90)
    _seed_saved(db_session, user.id, "s2", prompt="Ethereum question", score=85)
    _seed_saved(db_session, user.id, "s3", prompt="Solana question", score=70)
    db_session.commit()

    preset_id = await _create_preset(
        app_client, user, min_score=80, sort="score", format="json"
    )

    res = await app_client.get(
        f"/api/export-presets/{preset_id}/preview",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["preset_id"] == preset_id
    assert data["preset_name"] == "Preview Preset"
    assert data["format"] == "json"
    assert data["match_count"] == 2
    assert data["preview_limit"] == 5
    assert data["truncated"] is False
    # score desc order
    assert [p["score"] for p in data["preview"]] == [90, 85]
    assert data["filters"] == {
        "search": None,
        "persona_id": None,
        "min_score": 80,
        "max_score": None,
        "sort": "score",
    }

    # Preview is read-only: it must not mark the preset as used.
    get_res = await app_client.get(
        f"/api/export-presets/{preset_id}",
        headers=_pro_headers(user),
    )
    assert get_res.status_code == 200
    assert get_res.json()["last_used_at"] is None


@pytest.mark.asyncio
async def test_preview_honors_search_and_persona_filters(
    app_client, make_user, db_session, cleanup_export_presets
):
    user = cleanup_export_presets
    s1 = _seed_saved(
        db_session, user.id, "s1", prompt="Bitcoin analysis", persona_id="p1", score=88
    )
    _seed_saved(
        db_session, user.id, "s2", prompt="Bitcoin forecast", persona_id="p2", score=92
    )
    _seed_saved(
        db_session, user.id, "s3", prompt="Ethereum analysis", persona_id="p1", score=95
    )
    db_session.commit()

    preset_id = await _create_preset(
        app_client, user, search="Bitcoin", persona_id="p1", min_score=80
    )

    res = await app_client.get(
        f"/api/export-presets/{preset_id}/preview",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["match_count"] == 1
    assert data["preview"][0]["id"] == s1.id
    assert data["preview"][0]["persona_id"] == "p1"
    assert data["preview"][0]["persona_name"] == "Persona s1"


@pytest.mark.asyncio
async def test_preview_truncates_sample_at_limit(
    app_client, make_user, db_session, cleanup_export_presets
):
    user = cleanup_export_presets
    for i in range(8):
        _seed_saved(db_session, user.id, f"s{i}", score=90 - i)
    db_session.commit()

    preset_id = await _create_preset(app_client, user, min_score=0)

    res = await app_client.get(
        f"/api/export-presets/{preset_id}/preview",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["match_count"] == 8
    assert len(data["preview"]) == 5
    assert data["truncated"] is True


@pytest.mark.asyncio
async def test_preview_empty_match(
    app_client, make_user, db_session, cleanup_export_presets
):
    user = cleanup_export_presets
    _seed_saved(db_session, user.id, "s1", prompt="Bitcoin", score=90)
    db_session.commit()

    preset_id = await _create_preset(app_client, user, search="nonexistent-term")

    res = await app_client.get(
        f"/api/export-presets/{preset_id}/preview",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["match_count"] == 0
    assert data["preview"] == []
    assert data["truncated"] is False


@pytest.mark.asyncio
async def test_preview_foreign_or_missing_preset_returns_uniform_404(
    app_client, make_user, db_session
):
    alice = make_user(email="preview-alice@example.com", tier=UserTier.PRO)
    bob = make_user(email="preview-bob@example.com", tier=UserTier.PRO)
    db_session.commit()

    alice_preset = await _create_preset(app_client, alice)

    # Foreign preset: 404 (no existence oracle via 403 vs 404).
    res = await app_client.get(
        f"/api/export-presets/{alice_preset}/preview",
        headers=_pro_headers(bob),
    )
    assert res.status_code == 404

    # Missing preset: same uniform 404.
    res = await app_client.get(
        "/api/export-presets/999999/preview",
        headers=_pro_headers(alice),
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_preview_requires_plus_or_pro(app_client, make_user, db_session):
    user = make_user(email="preview-free@example.com", tier=UserTier.FREE)
    db_session.commit()

    res = await app_client.get(
        "/api/export-presets/1/preview",
        headers=_pro_headers(user),
    )
    assert res.status_code == 403
    assert res.json()["detail"]["error"] == "feature_not_allowed"


@pytest.mark.asyncio
async def test_preview_count_matches_actual_export(
    app_client, make_user, db_session, cleanup_export_presets
):
    """Parity: preview match_count equals the row count a real export returns."""
    user = cleanup_export_presets
    _seed_saved(db_session, user.id, "s1", prompt="Bitcoin", score=95)
    _seed_saved(db_session, user.id, "s2", prompt="Bitcoin", score=80)
    _seed_saved(db_session, user.id, "s3", prompt="Ethereum", score=90)
    _seed_saved(db_session, user.id, "s4", prompt="Solana", score=70)
    db_session.commit()

    preset_id = await _create_preset(
        app_client,
        user,
        search="Bitcoin",
        min_score=85,
        max_score=95,
        sort="score",
        format="json",
    )

    res = await app_client.get(
        f"/api/export-presets/{preset_id}/preview",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    preview = res.json()
    assert preview["match_count"] == 1

    export_res = await app_client.get(
        "/api/saved/export?format=json&search=Bitcoin&min_score=85&max_score=95&sort=score",
        headers=_pro_headers(user),
    )
    assert export_res.status_code == 200
    export_data = export_res.json()
    assert export_data["metadata"]["total_count"] == preview["match_count"]
    assert export_data["data"][0]["score"] == 95
    # The real export metadata must disclose the same filters as the preview,
    # including max_score (parity contract of the dry run).
    assert export_data["metadata"]["filters"]["max_score"] == preview["filters"]["max_score"]


@pytest.mark.asyncio
async def test_preview_honors_max_score_filter(
    app_client, make_user, db_session, cleanup_export_presets
):
    """Preview match_count + sample respect the preset's max_score bound."""
    user = cleanup_export_presets
    _seed_saved(db_session, user.id, "s1", score=90)
    _seed_saved(db_session, user.id, "s2", score=80)
    _seed_saved(db_session, user.id, "s3", score=70)
    db_session.commit()

    preset_id = await _create_preset(app_client, user, min_score=75, max_score=85)

    res = await app_client.get(
        f"/api/export-presets/{preset_id}/preview",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["match_count"] == 1
    assert [p["score"] for p in data["preview"]] == [80]


@pytest.mark.asyncio
async def test_preview_honors_oldest_sort(
    app_client, make_user, db_session, cleanup_export_presets
):
    """Preview sample ordering follows the preset's sort mode (oldest first)."""
    from datetime import timedelta

    user = cleanup_export_presets
    base = utcnow_naive()
    _seed_saved(db_session, user.id, "s1", score=90, saved_at=base + timedelta(days=2))
    _seed_saved(db_session, user.id, "s2", score=80, saved_at=base)
    _seed_saved(db_session, user.id, "s3", score=70, saved_at=base + timedelta(days=1))
    db_session.commit()

    preset_id = await _create_preset(app_client, user, sort="oldest")

    res = await app_client.get(
        f"/api/export-presets/{preset_id}/preview",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["match_count"] == 3
    assert [p["score"] for p in data["preview"]] == [80, 70, 90]


@pytest.mark.asyncio
async def test_preview_search_escapes_like_wildcards(
    app_client, make_user, db_session, cleanup_export_presets
):
    """A '%' in the preset search must not match every row (LIKE escaping)."""
    user = cleanup_export_presets
    _seed_saved(db_session, user.id, "s1", prompt="100% effort sprint")
    _seed_saved(db_session, user.id, "s2", prompt="fifty percent")
    db_session.commit()

    preset_id = await _create_preset(app_client, user, search="100%")

    res = await app_client.get(
        f"/api/export-presets/{preset_id}/preview",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["match_count"] == 1
    assert "prompt" not in data["preview"][0]  # sample omits full prompt text
    assert data["preview"][0]["one_liner"] == "Test answer"


@pytest.mark.asyncio
async def test_preview_rate_limited(app_client, make_user, db_session):
    """Preview calls share the per-user rate limiter (30/min)."""
    from arena.core import rate_limits as _rl

    user = make_user(email="preview-rl@example.com", tier=UserTier.PRO)
    db_session.commit()
    preset_id = await _create_preset(app_client, user)

    if hasattr(_rl.rate_limiter, "_events"):
        _rl.rate_limiter._events.clear()
    key = f"user:export_presets_preview:{user.id}"
    from collections import deque
    import time as _time

    _rl.rate_limiter._events[key] = deque([_time.time()] * 30)

    res = await app_client.get(
        f"/api/export-presets/{preset_id}/preview",
        headers=_pro_headers(user),
    )
    assert res.status_code == 429
    detail = res.json().get("detail", {})
    assert detail.get("error") == "rate_limit_exceeded"
    _rl.rate_limiter._events.clear()


@pytest.mark.asyncio
async def test_preview_legacy_whitespace_search_degrades_to_no_filter(
    app_client, make_user, db_session, cleanup_export_presets
):
    """Legacy presets with whitespace-only search preview cleanly (no 500)."""
    user = cleanup_export_presets
    _seed_saved(db_session, user.id, "s1", prompt="Bitcoin question")
    _seed_saved(db_session, user.id, "s2", prompt="Ethereum question")
    db_session.commit()

    preset_id = await _create_preset(app_client, user)
    # Simulate a row written before write-time search sanitization existed.
    preset = (
        db_session.query(ExportPreset)
        .filter(ExportPreset.id == preset_id)
        .one()
    )
    preset.search = "   "
    db_session.commit()

    res = await app_client.get(
        f"/api/export-presets/{preset_id}/preview",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    # Whitespace-only search must degrade to "no filter", and the disclosed
    # filters must match what the query actually ran.
    assert data["filters"]["search"] is None
    assert data["match_count"] == 2
    assert data["truncated"] is False


@pytest.mark.asyncio
async def test_duplicate_legacy_whitespace_search_produces_clean_copy(
    app_client, make_user, db_session, cleanup_export_presets
):
    """Duplicating a legacy preset with dirty search stores a clean copy."""
    user = cleanup_export_presets
    preset_id = await _create_preset(app_client, user)
    preset = (
        db_session.query(ExportPreset)
        .filter(ExportPreset.id == preset_id)
        .one()
    )
    preset.search = "   "
    db_session.commit()

    res = await app_client.post(
        f"/api/export-presets/{preset_id}/duplicate",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    new_id = res.json()["new_id"]

    copy = (
        db_session.query(ExportPreset)
        .filter(ExportPreset.id == new_id)
        .one()
    )
    assert copy.search is None


@pytest.mark.asyncio
async def test_preview_newest_order_ties_broken_by_id(
    app_client, make_user, db_session, cleanup_export_presets
):
    """Preview sample is deterministic when saved_at ties (id desc tiebreak)."""
    user = cleanup_export_presets
    same_moment = utcnow_naive()
    _seed_saved(db_session, user.id, "s1", score=80, saved_at=same_moment)
    _seed_saved(db_session, user.id, "s2", score=90, saved_at=same_moment)
    _seed_saved(db_session, user.id, "s3", score=70, saved_at=same_moment)
    db_session.commit()

    preset_id = await _create_preset(app_client, user)

    res = await app_client.get(
        f"/api/export-presets/{preset_id}/preview",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    # Newest order: s3 (id 3) first, then s2, then s1.
    assert [p["one_liner"] for p in data["preview"]] == [
        "Test answer",
        "Test answer",
        "Test answer",
    ]
    assert data["preview"][0]["id"] > data["preview"][1]["id"] > data["preview"][2]["id"]


@pytest.mark.asyncio
async def test_preview_oldest_order_ties_broken_by_id(
    app_client, make_user, db_session, cleanup_export_presets
):
    """Oldest sort preview is deterministic when saved_at ties (id asc)."""
    user = cleanup_export_presets
    same_moment = utcnow_naive()
    _seed_saved(db_session, user.id, "s1", score=80, saved_at=same_moment)
    _seed_saved(db_session, user.id, "s2", score=90, saved_at=same_moment)
    _seed_saved(db_session, user.id, "s3", score=70, saved_at=same_moment)
    db_session.commit()

    preset_id = await _create_preset(app_client, user, sort="oldest")

    res = await app_client.get(
        f"/api/export-presets/{preset_id}/preview",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["preview"][0]["id"] < data["preview"][1]["id"] < data["preview"][2]["id"]


@pytest.mark.asyncio
async def test_preview_discloses_sanitized_search(
    app_client, make_user, db_session, cleanup_export_presets
):
    """Preview filters echo the normalized search, matching what the query runs."""
    user = cleanup_export_presets
    _seed_saved(db_session, user.id, "s1", prompt="Bitcoin rally")
    _seed_saved(db_session, user.id, "s2", prompt="Ethereum rally")
    db_session.commit()

    preset_id = await _create_preset(app_client, user, search="  Bitcoin  ")

    res = await app_client.get(
        f"/api/export-presets/{preset_id}/preview",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["filters"]["search"] == "Bitcoin"
    assert data["match_count"] == 1

    export_res = await app_client.get(
        "/api/saved/export?format=json&search=Bitcoin&sort=newest",
        headers=_pro_headers(user),
    )
    assert export_res.status_code == 200
    assert export_res.json()["metadata"]["filters"]["search"] == "Bitcoin"
