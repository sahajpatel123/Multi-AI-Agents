"""Tests for Condura capability taxonomy and honest rejection."""

from __future__ import annotations

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


@pytest.mark.parametrize(
    "task,expected",
    [
        ("Research the SaaS market", "web"),
        ("Analyse Linear vs Jira", "web"),
        ("Check market news every 24 hours", "web"),
        # Bare "long-running" is web research language, not on-device agency.
        ("Do a long-running analysis of the SaaS market", "web"),
        ("Keep running the competitor landscape review for Q3", "web"),
        # "project" is web research wording — must not trip Linear filing heuristic.
        ("How should we file it under project governance for the board?", "web"),
        ("Research how teams file work under project management frameworks", "web"),
        (
            "Create a ticket in Linear from this research",
            "condura",
        ),
        (
            "Open Linear and create a ticket from this research",
            "condura",
        ),
        (
            "Write a concise research report on AI, then save it to ~/Documents/report.md.",
            "condura",
        ),
        (
            "Write a concise research report on AI, then save the report to "
            "~/Documents/brief.md on my machine.",
            "condura",
        ),
        ("save this report to ~/Documents/x.md", "condura"),
        ("save the file to disk", "condura"),
        ("Please save the report to my Documents folder", "condura"),
        ("export this file to disk", "condura"),
        ("open Notion and create a page", "condura"),
        ("Create a page in Notion for the research", "condura"),
        ("launch Terminal and run ls", "condura"),
        ("use my computer to file a ticket", "condura"),
        ("Click on my screen to open settings", "condura"),
        (
            "Watch AI regulation every 4 hours on my machine",
            "hybrid_delegate",
        ),
    ],
)
def test_classify_task_text_matrix(task, expected):
    from arena.core.capabilities import ExecutionEnvironment, classify_task_text

    assert classify_task_text(task) == ExecutionEnvironment(expected)


def test_demo_save_report_template_classifies_local():
    """Demo On-device template must never miss the honesty gate."""
    from arena.core.capabilities import ExecutionEnvironment, classify_task_text
    from arena.core.templates import TEMPLATES

    t = next(x for x in TEMPLATES if x["id"] == "save_report_local")
    filled = t["prompt_template"].format(topic="AI market", filename="brief.md")
    assert classify_task_text(filled) == ExecutionEnvironment.CONDURA


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


def test_execution_for_request_web_capability_with_local_text_returns_condura():
    """CRITICAL regression: /run passes capability_id='agent.research' (WEB)
    but the user might type 'open Linear'. The heuristic safety net MUST
    override WEB and return CONDURA so the 409 gate fires.
    """
    from arena.core.capabilities import ExecutionEnvironment, execution_for_request

    env, _ = execution_for_request(
        capability_id="agent.research",
        task_text="Analyse the B2B SaaS market",
    )
    assert env == ExecutionEnvironment.WEB

    env, _ = execution_for_request(
        capability_id="agent.research",
        task_text="Open Linear and create a ticket from this research",
    )
    assert env == ExecutionEnvironment.CONDURA, (
        f"expected CONDURA for local-intent text, got {env} — "
        f"the /run honest-rejection gate is a no-op without this safety net"
    )

    env, _ = execution_for_request(
        capability_id="agent.research",
        task_text="Watch AI regulation every 4 hours on my machine",
    )
    assert env == ExecutionEnvironment.HYBRID_DELEGATE

    env, _ = execution_for_request(
        capability_id="agent.research",
        task_text="save the report to ~/Documents/out.md",
    )
    assert env == ExecutionEnvironment.CONDURA


def test_evaluate_capability_gate_flag_on_off(monkeypatch):
    from arena.core.capabilities import evaluate_capability_gate

    monkeypatch.delenv("CONDURA_HONEST_REJECTION_ENABLED", raising=False)
    r = evaluate_capability_gate(
        capability_id="agent.research",
        task_text="Open Linear and create a ticket",
    )
    assert r["decision"] == "fallback"
    assert r["error_body"] is None

    monkeypatch.setenv("CONDURA_HONEST_REJECTION_ENABLED", "true")
    r = evaluate_capability_gate(
        capability_id="agent.research",
        task_text="Open Linear and create a ticket",
    )
    assert r["decision"] == "reject"
    assert r["error_body"]["error"] == "requires_local_execution"
    assert r["error_body"]["execution_environment"] == "condura"
    assert r["error_body"]["handoff_spec"] == "arena.handoff.v1"

    r = evaluate_capability_gate(
        capability_id="agent.research",
        task_text="Research B2B SaaS market size",
    )
    assert r["decision"] == "allow"

    # Regression: bare "long-running" web research must stay allow when honesty is on.
    r = evaluate_capability_gate(
        capability_id="agent.research",
        task_text="Do a long-running analysis of the SaaS market",
    )
    assert r["decision"] == "allow"
    assert r["env"].value == "web"

    # Regression: "file it under project …" is web research, not Linear handoff.
    r = evaluate_capability_gate(
        capability_id="agent.research",
        task_text="How should we file it under project governance for the board?",
    )
    assert r["decision"] == "allow"
    assert r["env"].value == "web"
