"""Integration tests for GET /api/agent/tasks/{task_id}/export.csv.

The CSV export turns a completed Agent report into a normalized,
spreadsheet-friendly sheet (task_id / section / key / value) and must share
the ownership and readiness guards of the markdown and JSON exports.
"""

from __future__ import annotations

import csv
import io
import json
import uuid

import pytest

from arena.core.auth import create_access_token
from arena.core.report_generator import generate_report_csv
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
        title="CSV export",
        task_text="Do the reports export to csv?",
        final_answer="Yes, they export cleanly.",
        final_score=82,
        final_confidence=0.8,
        sources_used=json.dumps(["source-a", "source-b"]),
    )
    if reports:
        row.source_integrity = reports["source_integrity"]
        row.assumptions = reports["assumptions"]
        row.dissent_report = reports["dissent_report"]
        row.temporal_profile = reports["temporal_profile"]
        row.steelman = reports["steelman"]
        row.intelligence_score = json.dumps(
            {
                "total_score": 82,
                "score_label": "strong",
                "one_line_verdict": "A solid, well-sourced answer.",
                "research_depth": {"score": 20},
                "logical_soundness": {"score": 21},
                "consensus_level": {"score": 20},
                "answer_durability": {"score": 21},
            }
        )
    db_session.add(row)
    db_session.flush()
    return row


@pytest.mark.asyncio
async def test_export_csv_returns_normalized_report(
    app_client, make_user, db_session
):
    user = make_user(email="csv-export@test.com", tier=UserTier.PRO)
    row = _seed_task(
        db_session, user_id=user.id, task_id="csv-export-1", reports=_reports()
    )
    db_session.commit()

    res = await app_client.get(
        f"/api/agent/tasks/{row.task_id}/export.csv",
        headers=_headers(user),
    )
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")
    assert f"arena-report-{row.task_id[:8]}.csv" in res.headers["content-disposition"]

    text = res.text
    assert text.startswith("\ufeff")
    assert "task_id,section,key,value" in text

    parsed = list(csv.DictReader(io.StringIO(text)))
    rows = {(r["section"], r["key"]): r["value"] for r in parsed}
    assert rows[("metadata", "question")] == "Do the reports export to csv?"
    assert rows[("metadata", "answer")] == "Yes, they export cleanly."
    assert rows[("metadata", "score")] == "82"
    assert rows[("intelligence", "one_line_verdict")] == "A solid, well-sourced answer."
    assert rows[("sources", "source 1")] == "source-a"
    assert rows[("steelman", "opposing_position")] == "The opposite view"
    assert rows[("assumptions", "assumption 1")] == "a1 (criticality: high, flag: True)"
    assert rows[("source_integrity", "summary")] == "Sources agree on the core claims."
    assert rows[("dissent", "position for")] == "3"
    assert rows[("temporal_profile", "decay_class")] == "durable"


@pytest.mark.asyncio
async def test_export_csv_scopes_to_owner(
    app_client, make_user, db_session
):
    owner = make_user(email="csv-owner@test.com", tier=UserTier.PRO)
    other = make_user(email="csv-other@test.com", tier=UserTier.PRO)
    row = _seed_task(db_session, user_id=owner.id, task_id="csv-owner-1")
    db_session.commit()

    res = await app_client.get(
        f"/api/agent/tasks/{row.task_id}/export.csv",
        headers=_headers(other),
    )
    assert res.status_code == 404

    missing = await app_client.get(
        "/api/agent/tasks/does-not-exist/export.csv",
        headers=_headers(owner),
    )
    assert missing.status_code == 404


@pytest.mark.asyncio
async def test_export_csv_requires_final_answer(
    app_client, make_user, db_session
):
    user = make_user(email="csv-empty@test.com", tier=UserTier.PRO)
    row = _seed_task(db_session, user_id=user.id, task_id="csv-empty-1")
    row.final_answer = None
    db_session.commit()

    res = await app_client.get(
        f"/api/agent/tasks/{row.task_id}/export.csv",
        headers=_headers(user),
    )
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_export_csv_rejects_whitespace_only_final_answer(
    app_client, make_user, db_session
):
    user = make_user(email="csv-ws@test.com", tier=UserTier.PRO)
    row = _seed_task(db_session, user_id=user.id, task_id="csv-ws-1")
    row.final_answer = " \n\t "
    db_session.commit()

    res = await app_client.get(
        f"/api/agent/tasks/{row.task_id}/export.csv",
        headers=_headers(user),
    )
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_export_csv_neutralizes_formula_payloads_end_to_end(
    app_client, make_user, db_session
):
    user = make_user(email="csv-inject@test.com", tier=UserTier.PRO)
    row = _seed_task(db_session, user_id=user.id, task_id="csv-inject-1")
    row.final_answer = "  =cmd|'/c calc'!A1"
    db_session.commit()

    res = await app_client.get(
        f"/api/agent/tasks/{row.task_id}/export.csv",
        headers=_headers(user),
    )
    assert res.status_code == 200
    parsed = list(csv.DictReader(io.StringIO(res.text)))
    answer = next(r["value"] for r in parsed if r["key"] == "answer")
    # The plain-answer path strips leading whitespace before sanitizing, so
    # the spreadsheet still receives a neutralized formula cell.
    assert answer == "'=cmd|'/c calc'!A1"


def test_generate_report_csv_neutralizes_formula_injection():
    row = AgentTask(
        user_id=1,
        task_id="unit-csv-1",
        task_text="Unit question",
        final_answer="=cmd|'/c calc'!A1",
    )
    body = generate_report_csv(row, {})
    assert body.startswith("\ufeff")
    assert "task_id,section,key,value" in body
    assert "'=cmd|'/c calc'!A1" in body


def test_generate_report_csv_neutralizes_whitespace_prefixed_triggers():
    """Spreadsheets ignore leading whitespace before formula detection, so
    tab/CR-prefixed and whitespace-padded triggers must be neutralized too."""
    row = AgentTask(
        user_id=1,
        task_id="unit-csv-2",
        task_text="Unit question",
        final_answer="Answer",
    )
    body = generate_report_csv(
        row,
        {"steelman": {"opposing_position": " \t+1+1"}},
    )
    parsed = list(csv.DictReader(io.StringIO(body)))
    position = next(
        r["value"]
        for r in parsed
        if r["section"] == "steelman" and r["key"] == "opposing_position"
    )
    assert position == "' \t+1+1"

    row = AgentTask(
        user_id=1,
        task_id="unit-csv-3",
        task_text="Unit question",
        final_answer="Answer",
    )
    body = generate_report_csv(
        row,
        {"steelman": {"strongest_evidence": "\r-cmd"}},
    )
    parsed = list(csv.DictReader(io.StringIO(body)))
    evidence = next(
        r["value"]
        for r in parsed
        if r["section"] == "steelman" and r["key"] == "strongest_evidence"
    )
    assert evidence == "'\r-cmd"


def test_generate_report_csv_round_trips_rfc4180_cells():
    """Commas, quotes, and embedded newlines must stay one parseable cell."""
    tricky = 'Line one\nLine two, with "quotes" and a comma, end.'
    row = AgentTask(
        user_id=1,
        task_id="unit-csv-4",
        task_text='Question with, comma and "quotes"',
        final_answer=tricky,
    )
    body = generate_report_csv(row, {})
    parsed = list(csv.DictReader(io.StringIO(body)))
    answer = next(r["value"] for r in parsed if r["key"] == "answer")
    assert answer == tricky
