"""Unit tests for the workflow security checker script."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
CHECKER_PATH = REPO_ROOT / "scripts" / "check_workflow_security.py"

_spec = importlib.util.spec_from_file_location(
    "check_workflow_security", CHECKER_PATH
)
assert _spec and _spec.loader is not None
checker = importlib.util.module_from_spec(_spec)
sys.modules["check_workflow_security"] = checker
_spec.loader.exec_module(checker)


def _write_workflow(tmp_path: Path, yaml_text: str) -> Path:
    path = tmp_path / "workflow.yml"
    path.write_text(yaml_text, encoding="utf-8")
    return path


def _violations(tmp_path: Path, yaml_text: str) -> list[str]:
    return checker.check_workflow(_write_workflow(tmp_path, yaml_text))


def _minimal_valid() -> str:
    return """
name: Demo

permissions:
  contents: read

on:
  push:
    branches: [main]

jobs:
  demo:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: actions/setup-python@v6
"""


def test_valid_workflow_passes(tmp_path: Path) -> None:
    assert _violations(tmp_path, _minimal_valid()) == []


def test_missing_top_level_permissions_is_reported(tmp_path: Path) -> None:
    text = _minimal_valid().replace("permissions:\n  contents: read\n", "")
    assert any("'permissions'" in v for v in _violations(tmp_path, text))


def test_wildcard_permissions_are_reported(tmp_path: Path) -> None:
    text = _minimal_valid().replace(
        "permissions:\n  contents: read\n",
        "permissions:\n  contents: write-all\n",
    )
    assert any("write-all" in v for v in _violations(tmp_path, text))


def test_dangerous_trigger_is_reported(tmp_path: Path) -> None:
    text = _minimal_valid().replace("push:", "pull_request_target:")
    assert any("pull_request_target" in v for v in _violations(tmp_path, text))


def test_missing_job_timeout_is_reported(tmp_path: Path) -> None:
    text = _minimal_valid().replace("    timeout-minutes: 5\n", "")
    assert any("timeout-minutes" in v for v in _violations(tmp_path, text))


def test_secrets_inherit_is_reported(tmp_path: Path) -> None:
    text = _minimal_valid().replace("runs-on: ubuntu-latest", "runs-on: ubuntu-latest\n    secrets: inherit")
    assert any("secrets: inherit" in v for v in _violations(tmp_path, text))


def test_checkout_must_not_persist_credentials(tmp_path: Path) -> None:
    text = _minimal_valid().replace(
        "with:\n          persist-credentials: false",
        "with:\n          fetch-depth: 0",
    )
    assert any("persist-credentials" in v for v in _violations(tmp_path, text))


def test_mutable_action_ref_is_reported(tmp_path: Path) -> None:
    text = _minimal_valid().replace("actions/setup-python@v6", "actions/setup-python@main")
    assert any("mutable ref" in v for v in _violations(tmp_path, text))


def test_action_below_pin_floor_is_reported(tmp_path: Path) -> None:
    text = _minimal_valid().replace("actions/checkout@v7", "actions/checkout@v6")
    assert any("pin floor" in v for v in _violations(tmp_path, text))


def test_unpinned_action_ref_is_reported(tmp_path: Path) -> None:
    text = _minimal_valid().replace("actions/setup-python@v6", "actions/setup-python")
    assert any("unpinned action" in v for v in _violations(tmp_path, text))


def test_local_action_is_allowed(tmp_path: Path) -> None:
    text = _minimal_valid().replace("actions/setup-python@v6", "./.github/actions/setup")
    assert _violations(tmp_path, text) == []


def test_sudo_outside_aptget_allowlist_is_reported(tmp_path: Path) -> None:
    text = _minimal_valid().replace(
        "- uses: actions/setup-python@v6",
        "- run: sudo chmod 777 /tmp/hack",
    )
    assert any("uses sudo" in v for v in _violations(tmp_path, text))
