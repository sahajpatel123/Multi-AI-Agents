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
        ".github/codeql-config.yml",
    ],
)
def test_workflow_yamls_are_valid(path: str) -> None:
    workflow_path = REPO_ROOT / path
    with workflow_path.open(encoding="utf-8") as fh:
        data = yaml.safe_load(fh)
    assert isinstance(data, dict)
    assert "name" in data


def test_codeql_uses_focused_config() -> None:
    codeql = yaml.safe_load(
        (REPO_ROOT / ".github" / "workflows" / "codeql.yml").read_text(encoding="utf-8")
    )
    init_steps = [
        step for step in codeql["jobs"]["analyze"]["steps"]
        if isinstance(step, dict) and step.get("name") == "Initialize CodeQL"
    ]
    assert init_steps, "CodeQL workflow is missing the Initialize CodeQL step"
    init = init_steps[0]
    assert init["with"]["config-file"] == ".github/codeql-config.yml", (
        "CodeQL workflow should use the focused config file"
    )

    config_path = REPO_ROOT / ".github" / "codeql-config.yml"
    assert config_path.exists(), "CodeQL config file is missing"
    config = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    ignores = config.get("paths-ignore", [])
    assert "**/tests/**" in ignores, "CodeQL should ignore test files"
    assert "web/frontend/dist/**" in ignores, "CodeQL should ignore build output"


def test_codeql_skips_docs_only_changes() -> None:
    codeql = yaml.safe_load(
        (REPO_ROOT / ".github" / "workflows" / "codeql.yml").read_text(encoding="utf-8")
    )
    on_key = "on" if "on" in codeql else True  # PyYAML maps `on:` to True
    for event in ("push", "pull_request"):
        paths_ignore = codeql[on_key][event].get("paths-ignore", [])
        assert "*.md" in paths_ignore, f"CodeQL should skip markdown-only {event}s"
        assert "design/**" in paths_ignore, f"CodeQL should skip design-only {event}s"
        assert "arena-video/**" in paths_ignore, f"CodeQL should skip arena-video {event}s"
        assert "app/**" in paths_ignore, f"CodeQL should skip app-only {event}s"
    assert "schedule" in codeql[on_key], "CodeQL should keep its weekly scheduled scan"


def test_ci_has_whitespace_diff_check() -> None:
    ci = yaml.safe_load(
        (REPO_ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
    )
    style = ci["jobs"].get("style")
    assert style is not None, "CI is missing the 'style' job"
    steps = style["steps"]
    checkout_steps = [
        step for step in steps
        if isinstance(step, dict)
        and step.get("uses", "").startswith("actions/checkout@")
    ]
    assert checkout_steps, "CI style job is missing a checkout step"
    assert checkout_steps[0].get("with", {}).get("fetch-depth") == 0, (
        "CI style job must fetch full history so the diff-range check works"
    )
    check_steps = [
        step for step in steps
        if isinstance(step, dict) and step.get("name") == "Whitespace / conflict check"
    ]
    assert check_steps, "CI style job is missing the whitespace check step"
    run_script = check_steps[0]["run"]
    assert "git diff --check" in run_script, (
        "CI style job no longer runs git diff --check"
    )
    assert 'pull_request' in run_script, (
        "CI style job should handle pull_request diff ranges"
    )
    assert '= "push"' in run_script, (
        "CI style job should handle push diff ranges"
    )


def test_ci_runs_pip_check() -> None:
    ci = yaml.safe_load(
        (REPO_ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
    )
    backend = ci["jobs"]["backend"]
    steps = backend["steps"]
    pip_check_steps = [
        step for step in steps
        if isinstance(step, dict)
        and step.get("name") == "Dependency consistency check (pip check)"
    ]
    assert pip_check_steps, "Backend CI job is missing the pip check step"
    assert "pip check" in pip_check_steps[0]["run"], (
        "pip check step should invoke python -m pip check"
    )


def test_codeowners_cover_ci_security_files() -> None:
    """Changes to CI/security config and guards need owner review."""
    codeowners = (REPO_ROOT / ".github" / "CODEOWNERS").read_text(encoding="utf-8")
    required_entries = (
        "/.github/codeql-config.yml",
        "/.github/dependabot.yml",
        "/.github/PULL_REQUEST_TEMPLATE.md",
        "/CONTRIBUTING.md",
        "/backend/tests/test_workflow_security_gates.py",
        "/backend/tests/test_no_stray_main_tokens.py",
    )
    for entry in required_entries:
        assert entry in codeowners, f"CODEOWNERS is missing an owner entry for {entry}"


def test_security_doc_lists_new_gates() -> None:
    """The security policy should keep describing the actual CI gates."""
    security_md = (REPO_ROOT / "SECURITY.md").read_text(encoding="utf-8")
    required_terms = (
        "pip check",
        "Source integrity",
        "git diff --check",
        "CODEOWNERS",
    )
    for term in required_terms:
        assert term in security_md, f"SECURITY.md is missing mention of {term!r}"


def test_dependabot_config_is_valid() -> None:
    """Dependabot config must be a real version-2 config, not a workflow file."""
    dependabot = yaml.safe_load(
        (REPO_ROOT / ".github" / "dependabot.yml").read_text(encoding="utf-8")
    )
    assert dependabot.get("version") == 2, "Dependabot config must declare version: 2"
    assert "on" not in dependabot, "Dependabot config must not contain a workflow 'on' key"
    assert "name" not in dependabot, "Dependabot config must not contain a workflow 'name' key"

    ecosystems = {u.get("package-ecosystem") for u in dependabot.get("updates", [])}
    assert {"pip", "npm", "github-actions"} <= ecosystems, (
        "Dependabot should cover pip, npm, and GitHub Actions"
    )
    assert all(u.get("open-pull-requests-limit") for u in dependabot.get("updates", [])), (
        "Each Dependabot update should set an open-pull-requests limit"
    )


def test_release_runs_pip_check() -> None:
    release = yaml.safe_load(
        (REPO_ROOT / ".github" / "workflows" / "release.yml").read_text(encoding="utf-8")
    )
    steps = release["jobs"]["build"]["steps"]
    pip_check_steps = [
        step for step in steps
        if isinstance(step, dict)
        and step.get("name") == "Dependency consistency check (pip check)"
    ]
    assert pip_check_steps, "Release workflow is missing the pip check step"
    assert "pip check" in pip_check_steps[0]["run"], (
        "Release pip check step should invoke pip check"
    )
    assert pip_check_steps[0].get("working-directory") == "backend", (
        "Release pip check step must run from the backend directory"
    )


def test_release_has_manual_dispatch() -> None:
    release = yaml.safe_load(
        (REPO_ROOT / ".github" / "workflows" / "release.yml").read_text(encoding="utf-8")
    )
    on_key = "on" if "on" in release else True
    assert "workflow_dispatch" in release[on_key], (
        "Release workflow should support manual workflow_dispatch runs"
    )
    assert "push" in release[on_key], "Release workflow should still run on tag pushes"
    tags = release[on_key]["push"]["tags"]
    assert "v*" in tags, "Release workflow should still run on v* tag pushes"


def test_pre_commit_config_and_ci_job() -> None:
    pre_commit = yaml.safe_load(
        (REPO_ROOT / ".pre-commit-config.yaml").read_text(encoding="utf-8")
    )
    local_hooks = [
        hook
        for repo in pre_commit.get("repos", [])
        for hook in repo.get("hooks", [])
    ]
    debug_hooks = [h for h in local_hooks if h.get("id") == "check-debug-statements"]
    assert debug_hooks, "pre-commit config is missing the debug-statement hook"
    entry = debug_hooks[0]["entry"]
    assert "rg" in entry, "debug-statement hook should use rg"
    assert "!**/.venv*/**" in entry, (
        "debug-statement hook should exclude vendored .venv directories"
    )

    ci = yaml.safe_load(
        (REPO_ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
    )
    assert "pre-commit" in ci["jobs"], "CI is missing the pre-commit job"
