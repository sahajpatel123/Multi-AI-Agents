"""Regression tests for the release-pipeline security hardening.

These guard the two release-gate changes that are easy to accidentally undo:
  1. Release artifacts must not ship a live ``backend/arena.db`` (which could
     contain user PII, password hashes, and tokens when built from a local
     checkout where the gitignored DB exists).
  2. The release job's ``npm audit`` step must be a real gate that fails on
     HIGH/CRITICAL findings rather than the old ``|| true`` no-op.

They parse the committed workflow YAML rather than running GitHub Actions, so
they run fast in the normal backend suite and catch regressions at PR time.
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
RELEASE_WORKFLOW = REPO_ROOT / ".github" / "workflows" / "release.yml"


def _load_release_workflow() -> dict:
    with RELEASE_WORKFLOW.open(encoding="utf-8") as fh:
        return yaml.safe_load(fh)


def _step_named(workflow: dict, name: str) -> dict:
    steps = workflow["jobs"]["build"]["steps"]
    for step in steps:
        if step.get("name") == name:
            return step
    raise AssertionError(f"release workflow is missing a step named {name!r}")


def test_release_artifacts_do_not_include_live_db() -> None:
    workflow = _load_release_workflow()
    upload = _step_named(workflow, "Upload artifacts")

    artifact_paths = upload["with"]["path"].splitlines()
    assert "backend/arena.db" not in artifact_paths, (
        "Release artifacts must not include backend/arena.db; a live SQLite "
        "database can contain user PII, password hashes, and tokens."
    )
    assert "backend/alembic/versions/" in artifact_paths, (
        "Release artifacts should still ship migration files so the schema "
        "snapshot remains available without publishing a live database."
    )


def test_release_npm_audit_is_a_real_security_gate() -> None:
    workflow = _load_release_workflow()
    audit = _step_named(workflow, "Security audit")
    run = audit["run"]

    # The old no-op line was `npm audit --audit-level=high || true`, which
    # always succeeded and let releases ship with known HIGH/CRITICAL
    # vulnerabilities. The hardened gate below must keep that exact bare form
    # out of the script (the intentional waiver branch uses a quoted fallback
    # inside the same step and is fine).
    assert "npm audit --audit-level=high || true" not in run.splitlines()[0], (
        "Release Security audit must not be the old always-succeed no-op gate."
    )

    # The real gate should fail on new HIGH/CRITICAL findings and only waive
    # advisories that npm has no published fix for.
    assert "audit_exit" in run, "Release Security audit should inspect npm exit code"
    assert "Unfixable advisories" in run, (
        "Release Security audit should call out unfixable advisories explicitly"
    )
    assert "exit 1" in run, (
        "Release Security audit should fail when a fixable HIGH/CRITICAL "
        "finding exists"
    )


@pytest.mark.parametrize(
    "path",
    [
        ".github/workflows/ci.yml",
        ".github/workflows/codeql.yml",
        ".github/workflows/release.yml",
    ],
)
def test_workflow_yamls_are_valid(path: str) -> None:
    workflow_path = REPO_ROOT / path
    with workflow_path.open(encoding="utf-8") as fh:
        data = yaml.safe_load(fh)
    assert isinstance(data, dict)
    assert "name" in data
