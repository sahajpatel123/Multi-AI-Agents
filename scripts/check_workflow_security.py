#!/usr/bin/env python3
"""Enforce security invariants for GitHub Actions workflow files.

Run from the repository root:

    python scripts/check_workflow_security.py

The checks are intentionally conservative and match the hardening already
applied to this repo's workflows:

  * every workflow declares an explicit least-privilege top-level `permissions`
    mapping, and neither the workflow nor any job grants `write-all`/`read-all`;
  * dangerous triggers (`pull_request_target`, `workflow_run`) are not used;
  * every job has a `timeout-minutes` so a hung run cannot consume a runner
    indefinitely;
  * no job inherits every repository secret via `secrets: inherit`;
  * every third-party action is pinned to a stable release tag or immutable
    SHA instead of a mutable branch like `main`, `master`, or `latest`;
  * security-critical actions cannot be downgraded below their known-good
    major version floor (matching the repo's Python/Node pin-floor guards);
  * every `actions/checkout` step sets `persist-credentials: false` so the
    runner does not leave the GITHUB_TOKEN in the local Git configuration;
  * `sudo` is only allowed for the apt-get package installs that are already
    required by the backend/e2e jobs.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]
WORKFLOWS_DIR = ROOT / ".github" / "workflows"

# The only sudo usage currently needed is installing libmagic on Ubuntu runners.
ALLOWED_SUDO = "sudo apt-get"
DANGEROUS_TRIGGERS = ("pull_request_target", "workflow_run")
MUTABLE_REF_MARKERS = (
    "@main",
    "@master",
    "@latest",
    "@head",
    "@develop",
    "@dev",
    "@vnext",
    "@nightly",
    "@canary",
    "@refs/heads/",
)

# Major-version floors for actions with a security/CI history in this repo.
# A downgrade below these floors fails the gate, just like the Python and
# Node pin-floor guards in ci.yml.
ACTION_MINIMUM_TAGS = {
    "actions/checkout": 7,
    "actions/setup-python": 6,
    "actions/setup-node": 7,
    # Both workflows are aligned on v7 (Node-24 runtime); a downgrade back
    # to v4 would reintroduce the deprecated Node 20 target.
    "actions/upload-artifact": 7,
    "actions/dependency-review-action": 5,
    # v3 moved off the force-upgraded Node 20 runtime (v2 warned every run).
    "gitleaks/gitleaks-action": 3,
    "github/codeql-action": 4,
}


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


def _all_steps(job: dict):
    return job.get("steps", []) if isinstance(job, dict) else []


def _check_permissions(path: Path, label: str, permissions) -> list[str]:
    """Validate a permissions mapping without allowing broad wildcard grants."""
    violations: list[str] = []
    if not isinstance(permissions, dict):
        violations.append(
            f"{path}: {label} 'permissions' must be an explicit least-privilege mapping"
        )
        return violations
    for scope, value in permissions.items():
        if isinstance(value, str) and value in {"write-all", "read-all"}:
            violations.append(
                f"{path}: {label} grants wildcard permission '{scope}: {value}'"
            )
    return violations


def _check_action_pinning(path: Path, job_name: str, uses: str) -> str | None:
    """Return a violation message if an action ref is mutable or unpinned."""
    if uses.startswith("./"):
        return None
    if "@" not in uses:
        return (
            f"{path}: job '{job_name}' step uses unpinned action '{uses}' "
            "(missing a version tag or SHA)"
        )
    ref = uses.split("@", 1)[1]
    if not ref:
        return (
            f"{path}: job '{job_name}' step uses action '{uses}' with an "
            "empty ref; pin to a stable tag or SHA"
        )
    ref_marker = f"@{ref}".lower()
    for marker in MUTABLE_REF_MARKERS:
        if marker in ref_marker:
            return (
                f"{path}: job '{job_name}' uses mutable ref '@{ref}' for "
                f"'{uses.split('@', 1)[0]}'; pin to a stable tag or SHA"
            )
    major_match = re.match(r"^v(\d+)", ref)
    if major_match:
        action_name = uses.split("@", 1)[0]
        minimum = ACTION_MINIMUM_TAGS.get(action_name)
        if minimum is not None and int(major_match.group(1)) < minimum:
            return (
                f"{path}: job '{job_name}' uses '{uses}' below the action "
                f"pin floor ({action_name} >= v{minimum})"
            )
    return None


def check_workflow(path: Path) -> list[str]:
    violations: list[str] = []

    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except Exception as exc:  # pragma: no cover - defensive for invalid YAML
        return [f"{path}: invalid YAML: {exc}"]

    if not isinstance(data, dict):
        return [f"{path}: workflow must be a YAML mapping"]

    violations.extend(_check_permissions(path, "workflow", data.get("permissions")))

    events = _events(data)
    for trigger in DANGEROUS_TRIGGERS:
        if trigger in events:
            violations.append(f"{path}: dangerous trigger '{trigger}' is not allowed")

    jobs = data.get("jobs", {})
    for job_name, job in jobs.items():
        if not isinstance(job, dict):
            continue
        violations.extend(
            _check_permissions(path, f"job '{job_name}'", job.get("permissions"))
        )
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
        for step in _all_steps(job):
            if not isinstance(step, dict):
                continue
            uses = step.get("uses")
            if isinstance(uses, str):
                pin_violation = _check_action_pinning(path, job_name, uses)
                if pin_violation:
                    violations.append(pin_violation)
            if not isinstance(step.get("run"), str):
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
