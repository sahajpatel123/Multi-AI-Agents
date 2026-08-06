"""Post-pipeline research reports survive reload and export.

The Agent Mode pipeline computes five reports while the blackboard is
warm: source_integrity, assumptions, dissent_report, temporal_profile,
and steelman. Previously only the in-memory blackboard carried them, so
any reload of /result, the saved-task payload, or an export returned
empty shells once the blackboard was dropped. This test pins the
persistence contract:

- save_task_to_memory stores the five reports on the AgentTask row.
- GET /result/{id} (persisted path) returns them with the same key
  filtering/truncation the live blackboard to_dict applies.
- GET /saved/{id} and the JSON export surface the same reports.
- A warm blackboard's fresh values still win over persisted ones when
  both exist (merge path).
"""

from __future__ import annotations

import json
import uuid
from types import SimpleNamespace

import pytest

import arena.core.agent_memory as agent_memory
from arena.core.auth import create_access_token
from arena.core.blackboard import (
    _filter_assumptions_keys,
    _filter_generic_dict_keys,
)
from arena.db_models import AgentTask, UserTier


def _headers(user):
    return {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}


def _reports() -> dict:
    return {
        "source_integrity": {
            "source_count": 3,
            "overall_source_integrity": 88,
            "integrity_label": "high",
            "summary": "Sources agree on the core claims.",
            "claims": [{"claim": "c1", "agreement_confidence": 90}],
            "contradictions": [],
        },
        "assumptions": {
            "assumption_count": 2,
            "assumptions": [
                {"assumption": "a1", "criticality": "high", "flag": True},
                {"assumption": "a2", "criticality": "low", "flag": False},
            ],
        },
        "dissent_report": {
            "positions": [{"label": "for", "count": 3}],
            "minority_view_summary": "One reviewer disagrees on pacing.",
        },
        "temporal_profile": {
            "decay_class": "durable",
            "half_life": "2-5 years",
            "recheck_by": None,
            "time_sensitive_claims": [],
        },
        "steelman": {
            "opposing_position": "The opposite view",
            "key_arguments": ["arg1"],
            "strongest_evidence": "evidence",
            "concession": "concede",
        },
    }


def _seed_task(
    db_session,
    *,
    user_id: int,
    task_id: str | None = None,
    reports: dict | None = None,
) -> AgentTask:
    row = AgentTask(
        user_id=user_id,
        task_id=task_id or str(uuid.uuid4()),
        title="Persisted reports",
        task_text="Do the reports persist?",
        final_answer="Yes, they persist.",
        final_score=80,
        final_confidence=0.75,
        sources_used=json.dumps(["source-a", "source-b"]),
    )
    if reports:
        row.source_integrity = reports["source_integrity"]
        row.assumptions = reports["assumptions"]
        row.dissent_report = reports["dissent_report"]
        row.temporal_profile = reports["temporal_profile"]
        row.steelman = reports["steelman"]
    db_session.add(row)
    db_session.flush()
    return row


# ─── Save path ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_save_task_to_memory_persists_reports(
    db_session, make_user, monkeypatch
):
    user = make_user(email="save-reports@test.com", tier=UserTier.PRO)
    db_session.commit()

    async def _no_topics(_text, _bb=None):
        return []

    async def _no_conclusions(_text, _bb=None):
        return []

    async def _no_contradictions(*_a, **_k):
        return []

    monkeypatch.setattr(agent_memory, "extract_topics", _no_topics)
    monkeypatch.setattr(agent_memory, "extract_conclusions", _no_conclusions)
    monkeypatch.setattr(agent_memory, "detect_contradictions", _no_contradictions)

    reports = _reports()
    task = await agent_memory.save_task_to_memory(
        db=db_session,
        user_id=user.id,
        task_id="save-reports-task",
        task_text="Do the reports persist?",
        final_answer="Yes, they persist.",
        final_score=80,
        final_confidence=0.75,
        sources_used=["source-a"],
        stages_run=["planner", "researcher", "solver", "synthesizer", "judge"],
        source_integrity=reports["source_integrity"],
        assumptions=reports["assumptions"],
        dissent_report=reports["dissent_report"],
        temporal_profile=reports["temporal_profile"],
        steelman=reports["steelman"],
    )

    db_session.refresh(task)
    assert task.source_integrity["overall_source_integrity"] == 88
    assert task.assumptions["assumption_count"] == 2
    assert task.dissent_report["minority_view_summary"].startswith("One reviewer")
    assert task.temporal_profile["decay_class"] == "durable"
    assert task.steelman["opposing_position"] == "The opposite view"


@pytest.mark.asyncio
async def test_save_task_to_memory_accepts_missing_reports(
    db_session, make_user, monkeypatch
):
    """Backward compatible: callers without reports still save fine."""
    user = make_user(email="save-no-reports@test.com", tier=UserTier.PRO)
    db_session.commit()

    async def _no_topics(_text, _bb=None):
        return []

    async def _no_conclusions(_text, _bb=None):
        return []

    async def _no_contradictions(*_a, **_k):
        return []

    monkeypatch.setattr(agent_memory, "extract_topics", _no_topics)
    monkeypatch.setattr(agent_memory, "extract_conclusions", _no_conclusions)
    monkeypatch.setattr(agent_memory, "detect_contradictions", _no_contradictions)

    task = await agent_memory.save_task_to_memory(
        db=db_session,
        user_id=user.id,
        task_id="save-no-reports-task",
        task_text="Plain save.",
        final_answer="Plain answer.",
        final_score=70,
        final_confidence=0.6,
        sources_used=[],
        stages_run=["solver"],
    )
    db_session.refresh(task)
    assert task.source_integrity is None
    assert task.assumptions is None
    assert task.dissent_report is None
    assert task.temporal_profile is None
    assert task.steelman is None


# ─── Persisted /result path ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_result_returns_persisted_reports(app_client, make_user, db_session):
    user = make_user(email="result-reports@test.com", tier=UserTier.PRO)
    reports = _reports()
    _seed_task(db_session, user_id=user.id, task_id="result-reports-1", reports=reports)
    db_session.commit()

    res = await app_client.get(
        "/api/agent/result/result-reports-1",
        headers=_headers(user),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["source_integrity"]["overall_source_integrity"] == 88
    assert body["source_integrity"]["integrity_label"] == "high"
    assert body["assumptions"]["assumption_count"] == 2
    assert body["dissent_report"]["minority_view_summary"].startswith("One reviewer")
    assert body["temporal_profile"]["decay_class"] == "durable"
    assert body["steelman"]["opposing_position"] == "The opposite view"


@pytest.mark.asyncio
async def test_result_empty_reports_for_row_without_reports(
    app_client, make_user, db_session
):
    user = make_user(email="result-empty-reports@test.com", tier=UserTier.PRO)
    _seed_task(db_session, user_id=user.id, task_id="result-empty-reports-1")
    db_session.commit()

    res = await app_client.get(
        "/api/agent/result/result-empty-reports-1",
        headers=_headers(user),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["source_integrity"] == {}
    assert body["assumptions"] == {}
    assert body["dissent_report"] == {}
    assert body["temporal_profile"] == {}
    assert body["steelman"] is None


# ─── Filtering parity with the live blackboard path ────────────────────────


@pytest.mark.asyncio
async def test_result_applies_same_filters_as_blackboard_to_dict(
    app_client, make_user, db_session
):
    """A corrupted/oversized row is capped exactly like a live blackboard."""
    user = make_user(email="result-filters@test.com", tier=UserTier.PRO)
    oversized = {"summary": "x" * 500}
    oversized.update({f"k{i}": f"v{i}" for i in range(30)})
    reports = _reports()
    reports["source_integrity"] = oversized
    reports["assumptions"] = {
        "assumption_count": 1,
        "assumptions": [],
        "injected_key": "dropped",
    }
    _seed_task(db_session, user_id=user.id, task_id="result-filters-1", reports=reports)
    db_session.commit()

    res = await app_client.get(
        "/api/agent/result/result-filters-1",
        headers=_headers(user),
    )
    assert res.status_code == 200
    body = res.json()

    expected = _filter_generic_dict_keys(oversized)
    assert body["source_integrity"] == expected
    assert len(body["source_integrity"]) == 10
    assert body["source_integrity"]["summary"] == "x" * 100
    assert body["assumptions"] == _filter_assumptions_keys(
        reports["assumptions"]
    )
    assert "injected_key" not in body["assumptions"]


# ─── Saved-task payload + exports ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_saved_task_payload_returns_reports(
    app_client, make_user, db_session
):
    user = make_user(email="saved-reports@test.com", tier=UserTier.PRO)
    reports = _reports()
    row = _seed_task(
        db_session, user_id=user.id, task_id="saved-reports-1", reports=reports
    )
    db_session.commit()

    res = await app_client.get(
        f"/api/agent/saved/{row.task_id}",
        headers=_headers(user),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["source_integrity"]["overall_source_integrity"] == 88
    assert body["assumptions"]["assumption_count"] == 2
    assert body["dissent_report"]["minority_view_summary"].startswith("One reviewer")
    assert body["temporal_profile"]["decay_class"] == "durable"
    assert body["steelman"]["opposing_position"] == "The opposite view"


@pytest.mark.asyncio
async def test_export_json_includes_reports(app_client, make_user, db_session):
    user = make_user(email="export-reports@test.com", tier=UserTier.PRO)
    reports = _reports()
    row = _seed_task(
        db_session, user_id=user.id, task_id="export-reports-1", reports=reports
    )
    db_session.commit()

    res = await app_client.get(
        f"/api/agent/tasks/{row.task_id}/export.json",
        headers=_headers(user),
    )
    assert res.status_code == 200
    payload = res.json()
    assert payload["source_integrity"]["overall_source_integrity"] == 88
    assert payload["assumptions"]["assumption_count"] == 2
    assert payload["dissent_report"]["minority_view_summary"].startswith("One reviewer")
    assert payload["temporal_profile"]["decay_class"] == "durable"
    assert payload["steelman"]["opposing_position"] == "The opposite view"


# ─── Merge path: warm blackboard wins unless the row has data ──────────────


def test_merge_db_task_into_result_payload_overlays_persisted_reports():
    from arena.routes.agent import _merge_db_task_into_result_payload

    payload = {
        "source_integrity": {"from": "bb"},
        "assumptions": {"from": "bb"},
        "dissent_report": {"from": "bb"},
        "temporal_profile": {"from": "bb"},
        "steelman": {"from": "bb"},
    }
    row = SimpleNamespace(
        intelligence_score=None,
        source_integrity={"overall_source_integrity": 91},
        assumptions={"assumption_count": 1},
        dissent_report={"positions": []},
        temporal_profile={"decay_class": "durable"},
        steelman={"opposing_position": "persisted"},
        is_live=False,
        live_last_checked=None,
        live_next_check=None,
        live_updates=None,
    )

    _merge_db_task_into_result_payload(payload, row)

    assert payload["source_integrity"]["overall_source_integrity"] == 91
    assert payload["assumptions"]["assumption_count"] == 1
    assert payload["dissent_report"]["positions"] == []
    assert payload["temporal_profile"]["decay_class"] == "durable"
    assert payload["steelman"]["opposing_position"] == "persisted"


def test_merge_db_task_into_result_payload_keeps_bb_when_row_empty():
    from arena.routes.agent import _merge_db_task_into_result_payload

    payload = {
        "source_integrity": {"from": "bb"},
        "assumptions": {"from": "bb"},
        "dissent_report": {"from": "bb"},
        "temporal_profile": {"from": "bb"},
        "steelman": {"from": "bb"},
    }
    row = SimpleNamespace(
        intelligence_score=None,
        source_integrity=None,
        assumptions=None,
        dissent_report=None,
        temporal_profile=None,
        steelman=None,
        is_live=False,
        live_last_checked=None,
        live_next_check=None,
        live_updates=None,
    )

    _merge_db_task_into_result_payload(payload, row)

    assert payload["source_integrity"] == {"from": "bb"}
    assert payload["assumptions"] == {"from": "bb"}
    assert payload["dissent_report"] == {"from": "bb"}
    assert payload["temporal_profile"] == {"from": "bb"}
    assert payload["steelman"] == {"from": "bb"}
