"""Tests for Condura capability taxonomy and honest rejection."""

from __future__ import annotations

import os

import pytest
from pydantic import ValidationError


def test_registry_has_web_and_local_capabilities():
    from arena.core.capabilities import REGISTRY, ExecutionEnvironment, resolve

    assert "agent.research" in REGISTRY
    assert "app.open_in_linear" in REGISTRY
    assert resolve("agent.research").execution == ExecutionEnvironment.WEB
    assert resolve("app.open_in_linear").execution == ExecutionEnvironment.CONDURA
    assert resolve("report.save_to_local").execution == ExecutionEnvironment.HYBRID_PREP
    assert resolve("agent.long_research").execution == ExecutionEnvironment.HYBRID_DELEGATE


def test_non_web_capability_rejects_missing_args_schema():
    from arena.core.capabilities import ConduraCapability, FallbackMessage

    with pytest.raises(ValidationError):
        ConduraCapability(
            id="x",
            description="y",
            condura_method="z",
            fallback=FallbackMessage(title="t", body="b"),
            args_schema=None,
        )


def test_classify_task_text_local_intent():
    from arena.core.capabilities import ExecutionEnvironment, classify_task_text

    assert classify_task_text("Research the SaaS market") == ExecutionEnvironment.WEB
    assert (
        classify_task_text("Create a ticket in Linear from this research")
        == ExecutionEnvironment.CONDURA
    )
    assert (
        classify_task_text("Watch AI regulation every 4 hours on my machine")
        == ExecutionEnvironment.HYBRID_DELEGATE
    )


def test_local_execution_error_body_shape():
    from arena.core.capabilities import ExecutionEnvironment, local_execution_error_body

    body = local_execution_error_body(ExecutionEnvironment.CONDURA)
    assert body["error"] == "requires_local_execution"
    assert body["execution_environment"] == "condura"
    assert body["handoff_spec"] == "arena.handoff.v1"
    assert "install_url" in body


def test_honest_rejection_flag_default_off(monkeypatch):
    from arena.core import capabilities as caps

    monkeypatch.delenv("CONDURA_HONEST_REJECTION_ENABLED", raising=False)
    assert caps.honest_rejection_enabled() is False
    monkeypatch.setenv("CONDURA_HONEST_REJECTION_ENABLED", "true")
    assert caps.honest_rejection_enabled() is True


def test_requires_local_rejection():
    from arena.core.capabilities import ExecutionEnvironment, requires_local_rejection

    assert requires_local_rejection(ExecutionEnvironment.WEB) is False
    assert requires_local_rejection(ExecutionEnvironment.HYBRID_PREP) is False
    assert requires_local_rejection(ExecutionEnvironment.CONDURA) is True
    assert requires_local_rejection(ExecutionEnvironment.HYBRID_DELEGATE) is True


def test_templates_include_condura_demos():
    from arena.core.templates import TEMPLATES

    ids = {t["id"] for t in TEMPLATES}
    assert "open_in_linear" in ids
    assert "save_report_local" in ids
    assert "long_research_delegate" in ids
    long_t = next(t for t in TEMPLATES if t["id"] == "long_research_delegate")
    assert long_t.get("disabled") is True
