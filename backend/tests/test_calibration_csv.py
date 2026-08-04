import pytest
from arena.core.datetime_utils import utcnow_naive
from arena.core.auth import create_access_token
from arena.db_models import ConfidenceRating, UserTier


def _make_pro(make_user):
    return make_user(email="pro_cal@example.com", tier=UserTier.PRO)


def _pro_headers(user):
    """Build the Authorization header for a pro-tier user."""
    return {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}


def _seed_calibration_rating(db_session, user_id, task_id, user_rating=80, system_score=85):
    rating = ConfidenceRating(
        user_id=user_id,
        task_id=task_id,
        user_rating=user_rating,
        system_score=system_score,
        delta=system_score - user_rating,
        created_at=utcnow_naive(),
    )
    db_session.add(rating)
    db_session.flush()
    return rating


@pytest.mark.asyncio
async def test_calibration_csv_export(app_client, make_user, db_session):
    """Test CSV export of calibration history."""
    user = _make_pro(make_user)
    db_session.commit()
    
    _seed_calibration_rating(db_session, user.id, "task-1", user_rating=80, system_score=85)
    _seed_calibration_rating(db_session, user.id, "task-2", user_rating=75, system_score=90)
    _seed_calibration_rating(db_session, user.id, "task-3", user_rating=90, system_score=85)
    db_session.commit()

    res = await app_client.get(
        "/api/calibration/history/export.csv",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    assert "text/csv" in res.headers["content-type"]
    text = res.text
    assert "task_id" in text
    assert "user_rating" in text
    assert "system_score" in text
    assert "delta" in text
    assert "verdict" in text
    assert "created_at" in text
    assert "task-1" in text
    assert "task-2" in text
    assert "task-3" in text


@pytest.mark.asyncio
async def test_calibration_csv_export_empty(app_client, make_user, db_session):
    """Test CSV export when user has no calibration ratings."""
    user = _make_pro(make_user)
    db_session.commit()

    res = await app_client.get(
        "/api/calibration/history/export.csv",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    text = res.text
    assert "task_id" in text  # Header should be present
    assert "task-1" not in text  # No data rows


@pytest.mark.asyncio
async def test_calibration_csv_formula_injection_defense(app_client, make_user, db_session):
    """Test CSV export defends against formula injection."""
    user = _make_pro(make_user)
    db_session.commit()
    
    _seed_calibration_rating(db_session, user.id, "=cmd|'/c calc'!A1", user_rating=80, system_score=85)
    db_session.commit()

    res = await app_client.get(
        "/api/calibration/history/export.csv",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    text = res.text
    # Formula should be quoted/escaped
    assert "'=cmd|'/c calc'!A1" in text or "=cmd" not in text