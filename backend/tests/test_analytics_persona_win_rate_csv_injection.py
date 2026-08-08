"""Unit + integration tests for the CSV injection defense on the persona
win-rate export.

The previous loop shipped the CSV endpoint without sanitizing cell values
against formula injection. This is CWE-1236: an attacker who can influence
a cell's first character (e.g. ``=cmd|'/c calc'!A1``) gets code execution
on the next analyst who opens the file in Excel / Google Sheets.

Persona names currently come from a trusted code-defined metadata dict,
so this is defense-in-depth. A future feature (custom persona renames,
admin overrides, prompt-injection-driven metadata writes) could let
attacker-controlled bytes land here. Pin the mitigation now so the
contract holds if the data source ever changes.
"""

from __future__ import annotations

import csv
import io
import uuid
from datetime import timedelta

import pytest

from arena.core.datetime_utils import utcnow_naive
from arena.db_models import ScoringAudit, UserTier
from arena.routes.analytics import _csv_safe, _CSV_FORMULA_PREFIXES


# ─── Unit tests for the helper ─────────────────────────────────────────────


@pytest.mark.parametrize("ch", list("=+-@\t\r"))
def test_csv_safe_neutralizes_formula_prefix(ch: str):
    """Every OWASP-listed trigger must be neutralized with a leading quote."""
    payload = f"{ch}cmd|'/c calc'!A1"
    out = _csv_safe(payload)
    assert out.startswith("'"), f"Trigger {ch!r} not neutralized: {out!r}"
    # The rest of the content is preserved unchanged so legitimate
    # persona-style data isn't mangled.
    assert out[1:] == payload


def test_csv_safe_passes_through_safe_strings():
    assert _csv_safe("The Analyst") == "The Analyst"
    assert _csv_safe("analyst") == "analyst"
    assert _csv_safe("Stoic #1") == "Stoic #1"


def test_csv_safe_only_quotes_at_first_character():
    """A ``=`` mid-string is not a formula trigger — only the first char is."""
    assert _csv_safe("a=b") == "a=b"
    assert _csv_safe("foo=bar+baz") == "foo=bar+baz"
    assert _csv_safe("price: $5 - $10") == "price: $5 - $10"


def test_csv_safe_handles_empty_and_none():
    """Empty / None must not crash — they degrade to an empty cell."""
    assert _csv_safe("") == ""
    assert _csv_safe(None) == ""


def test_csv_safe_coerces_non_string_values():
    """Numbers and bools stringify through and never trigger a prefix."""
    assert _csv_safe(42) == "42"
    assert _csv_safe(0) == "0"
    assert _csv_safe(True) == "True"
    assert _csv_safe(False) == "False"
    assert _csv_safe(0.75) == "0.75"


def test_csv_safe_all_formula_prefixes_listed():
    """Pin the documented set so adding a new trigger is a deliberate edit."""
    # OWASP CSV Injection guidance lists these six. If we ever add more
    # (e.g. ``|`` for some Excel flavors), update both this test and
    # the helper together.
    assert set(_CSV_FORMULA_PREFIXES) == {"=", "+", "-", "@", "\t", "\r"}


def test_csv_safe_does_not_double_quote():
    """Re-applying to an already-quoted string must not stack quotes."""
    once = _csv_safe("=cmd")
    twice = _csv_safe(once)
    # The OWASP mitigation is a one-shot prefix. A second pass sees the
    # leading "'" which is not a trigger, so we leave the value alone.
    assert twice == once


# ─── End-to-end through the export route ───────────────────────────────────


def _seed_audit(
    db,
    *,
    user_id: int,
    winner_persona_id: str,
    panel: list[str],
    hours_ago: int = 1,
) -> ScoringAudit:
    rec = ScoringAudit(
        session_id=str(uuid.uuid4()),
        user_id=user_id,
        prompt_snippet="x",
        winner_agent_id="agent-1",
        winner_persona_id=winner_persona_id,
        winner_score=80,
        scores={"agent-1": 80},
        persona_ids_used=panel,
        fallback_used=False,
        created_at=utcnow_naive() - timedelta(hours=hours_ago),
    )
    db.add(rec)
    db.flush()
    return rec


def _parse_csv(text: str) -> list[list[str]]:
    return list(csv.reader(io.StringIO(text)))


@pytest.mark.asyncio
async def test_csv_response_includes_nosniff_header(app_client, make_user):
    """nosniff is the secondary defense — even a poisoned CSV can't be
    navigated-to as HTML by a curious browser."""
    user = make_user(email="csv-nosniff@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/persona-win-rate/export.csv",
        headers=_pro_headers(user),
    )
    assert res.headers.get("x-content-type-options") == "nosniff"


@pytest.mark.asyncio
async def test_csv_real_persona_names_are_unquoted(app_client, make_user, db_session):
    """The canonical metadata-defined names must NOT be mangled by the
    sanitization — adding the helper shouldn't change the happy path."""
    user = make_user(email="csv-clean@test.com", tier=UserTier.PRO)
    _seed_audit(
        db_session, user_id=user.id, winner_persona_id="analyst", panel=["analyst"]
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-win-rate/export.csv",
        headers=_pro_headers(user),
    )
    rows = _parse_csv(res.text)[1:]
    # The Analyst is the metadata name for persona_id=analyst — it must
    # come through verbatim, no leading quote.
    assert rows[0][1] == "The Analyst"
    assert not rows[0][0].startswith("'")


@pytest.mark.asyncio
async def test_csv_poisoned_persona_id_is_neutralized_at_endpoint(
    app_client, make_user, db_session, monkeypatch
):
    """End-to-end: a poisoned persona id MUST be quoted in the output.

    We monkey-patch PERSONA_METADATA so the route's helper resolves the
    poisoned id to a malicious-looking name — mirroring what a future
    feature (custom persona renames) could let happen organically.
    """
    from arena.core import agents as agents_module

    poisoned = {
        "analyst": {"name": "=cmd|'/c calc'!A1", "color": "#000"},
        "stoic": {"name": "+1+1", "color": "#000"},
        "pragmatist": {"name": "@SUM(1+1)", "color": "#000"},
        "historian": {"name": "-2+2", "color": "#000"},
    }
    monkeypatch.setattr(agents_module, "PERSONA_METADATA", poisoned)

    user = make_user(email="csv-poison@test.com", tier=UserTier.PRO)
    for persona in ("analyst", "stoic", "pragmatist", "historian"):
        _seed_audit(
            db_session,
            user_id=user.id,
            winner_persona_id=persona,
            panel=[persona],
        )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-win-rate/export.csv?min_appearances=1",
        headers=_pro_headers(user),
    )
    rows = _parse_csv(res.text)[1:]
    by_id = {row[0]: row for row in rows}

    # The persona_id itself doesn't start with a trigger, so it passes
    # through unchanged. The poisoned NAME field is what gets
    # neutralized — that's the cell a spreadsheet would interpret as a
    # formula.
    assert by_id["analyst"][0] == "analyst"
    assert by_id["analyst"][1] == "'=cmd|'/c calc'!A1"

    assert by_id["stoic"][0] == "stoic"
    assert by_id["stoic"][1] == "'+1+1"

    assert by_id["pragmatist"][0] == "pragmatist"
    assert by_id["pragmatist"][1] == "'@SUM(1+1)"

    assert by_id["historian"][0] == "historian"
    assert by_id["historian"][1] == "'-2+2"
