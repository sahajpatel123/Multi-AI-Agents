"""Prometheus text-format rendering + admin-gated /api/condura/metrics/prom."""

from __future__ import annotations

import pytest

import arena.core.telemetry as telemetry
from arena.core.auth import create_access_token


def test_render_prometheus_emits_help_and_type_lines():
    body = telemetry.render_prometheus()
    # The renderer emits HELP/TYPE only for series that have at least one
    # observation — we exercise each declared counter and then assert the
    # body contains the right metadata.
    for name, metric_type in telemetry._COUNTER_TYPES.items():
        labels: dict[str, str] = {}
        if name == "capability_guard_decisions_total":
            labels = {"capability_id": "load-test", "decision": "allow"}
        elif name == "handoffs_dispatched_total":
            labels = {"capability_id": "load-test"}
        elif name == "condura_probe_state_total":
            labels = {"kind": "ready"}
        telemetry.incr(name, labels)
    body = telemetry.render_prometheus()
    for name, metric_type in telemetry._COUNTER_TYPES.items():
        assert f"# TYPE {name} {metric_type}" in body, body
    for name in telemetry._COUNTER_TYPES:
        assert f"# HELP {name}" in body, body


def test_render_prometheus_includes_current_counter_values(monkeypatch):
    # Reset only the key we care about so other tests' counter values
    # don't make this one ambiguous.
    telemetry._counters.pop(
        "capability_guard_decisions_total{capability_id=pr-mono,decision=allow}",
        None,
    )
    telemetry.incr(
        "capability_guard_decisions_total",
        {"capability_id": "pr-mono", "decision": "allow"},
    )
    body = telemetry.render_prometheus()
    assert (
        'capability_guard_decisions_total{capability_id="pr-mono",decision="allow"} 1'
        in body
    )


def test_render_prometheus_escapes_label_values(monkeypatch):
    """Backslash, quote, and newline in label values must be escaped per the
    Prometheus text-format spec so scrapers don't parse them as structural
    tokens."""
    telemetry.incr("condura_probe_state_total", {"kind": 'weird"value\\with\nnewline'})
    body = telemetry.render_prometheus()
    assert 'condura_probe_state_total{kind="weird\\"value\\\\with\\nnewline"}' in body


def test_render_prometheus_uses_untyped_for_undeclared_counters(monkeypatch):
    telemetry.incr("totally_undeclared_counter_total")
    body = telemetry.render_prometheus()
    assert "# TYPE totally_undeclared_counter_total untyped" in body


@pytest.mark.asyncio
async def test_prom_endpoint_requires_admin(app_client, make_user, monkeypatch):
    from arena import config

    monkeypatch.setenv("ADMIN_EMAIL", "ops@arena.test")
    config.get_settings.cache_clear()

    from arena.db_models import UserTier

    user = make_user(email="non-admin-prom@test.com", tier=UserTier.PRO)
    headers = {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}
    res = await app_client.get("/api/condura/metrics/prom", headers=headers)
    assert res.status_code == 403
    config.get_settings.cache_clear()


@pytest.mark.asyncio
async def test_prom_endpoint_returns_text_plain_for_admin(app_client, make_user, monkeypatch):
    from arena import config

    monkeypatch.setenv("ADMIN_EMAIL", "user@test.com")
    config.get_settings.cache_clear()

    user = make_user(email="user@test.com")
    headers = {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}
    res = await app_client.get("/api/condura/metrics/prom", headers=headers)
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/plain")
    # The body should contain at least one HELP line from declared counters.
    body = res.text
    assert "# HELP capability_guard_decisions_total" in body
    config.get_settings.cache_clear()