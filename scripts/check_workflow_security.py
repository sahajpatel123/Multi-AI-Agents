#!/usr/bin/env python3
"""Enforce security invariants for GitHub Actions workflow files.

Run from the repository root:

    python scripts/check_workflow_security.py

The checks are intentionally conservative and match the hardening already
applied to this repo's workflows:

  * every workflow declares an explicit least-privilege top-level `permissions`
    mapping (no implicit broad GitHub token scopes);
  * dangerous triggers (`pull_request_target`, `workflow_run`) are not used;
  * every job has a `timeout-minutes` so a hung run cannot consume a runner
    indefinitely;
  * no job inherits every repository secret via `secrets: inherit`;
  * every `actions/checkout` step sets `persist-credentials: false` so the
    runner does not leave the GITHUB_TOKEN in the local Git configuration;
  * `sudo` is only allowed for the apt-get package installs that are already
    required by the backend/e2e jobs.
"""

from __future__ import annotations

import sys
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]
WORKFLOWS_DIR = ROOT / ".github" / "workflows"

# The only sudo usage currently needed is installing libmagic on Ubuntu runners.
ALLOWED_SUDO = "sudo apt-get"
DANGEROUS_TRIGGERS = ("pull_request_target", "workflow_run")


def _events(data: dict) -> dict:
    """Return the workflow `on` trigger mapping, tolerating PyYAML's bool key."""
    if "on" in data:
        return data["on"]
    # PyYAML parses an unquoted `on:` key as boolean True.
    return data.get(True, {})


def _checkout_steps(job: dict):
    for step in job.get("steps", []):
        if not isinstance(step, dict):
            continue
        uses = step.get("uses")
        if isinstance(uses, str) and uses.startswith("actions/checkout@"):
            yield step


def check_workflow(path: Path) -> list[str]:
    violations: list[str] = []

    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except Exception as exc:  # pragma: no cover - defensive for invalid YAML
        return [f"{path}: invalid YAML: {exc}"]

    if not isinstance(data, dict):
        return [f"{path}: workflow must be a YAML mapping"]

    permissions = data.get("permissions")
    if not isinstance(permissions, dict):
        violations.append(
            f"{path}: top-level 'permissions' must be an explicit least-privilege mapping"
        )

    events = _events(data)
    for trigger in DANGEROUS_TRIGGERS:
        if trigger in events:
            violations.append(f"{path}: dangerous trigger '{trigger}' is not allowed")

    jobs = data.get("jobs", {})
    for job_name, job in jobs.items():
        if not isinstance(job, dict):
            continue
        if "timeout-minutes" not in job:
            violations.append(f"{path}: job '{job_name}' is missing timeout-minutes")
        if job.get("secrets") == "inherit":
            violations.append(
                f"{path}: job '{job_name}' must not use 'secrets: inherit'"
            )
        for step in _checkout_steps(job):
            if step.get("with", {}).get("persist-credentials") is not False:
                violations.append(
                    f"{path}: checkout in job '{job_name}' must set persist-credentials: false"
                )
        for step in job.get("steps", []):
            if not isinstance(step, dict) or not isinstance(step.get("run"), str):
                continue
            run = step["run"]
            if "sudo" in run and ALLOWED_SUDO not in run:
                step_name = step.get("name", "<unnamed run step>")
                violations.append(
                    f"{path}: job '{job_name}' step '{step_name}' uses sudo "
                    "outside the apt-get allowlist"
                )

    return violations


def main() -> int:
    workflow_paths = sorted(WORKFLOWS_DIR.glob("*.yml"))
    failures: list[str] = []
    for path in workflow_paths:
        failures.extend(check_workflow(path))

    if failures:
        print("Workflow security violations:")
        for failure in failures:
            print(f"  - {failure}")
        return 1

    print(f"Workflow security OK ({len(workflow_paths)} workflows checked)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
