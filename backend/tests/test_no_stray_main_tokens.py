"""Guard against the stray-token corruption that broke CI in August 2026.

A bad merge/autopaste inserted bare ``main`` lines into Python and TypeScript
source files, which produced SyntaxError / JSX parse failures in CI while the
files still looked superficially close to normal. This test scans the same
source trees the build uses and fails the suite if any bare ``main`` token is
present, so the corruption is caught at PR time instead of silently turning CI
red.
"""

from __future__ import annotations

import re
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
SCAN_DIRS = (
    REPO_ROOT / "backend" / "arena",
    REPO_ROOT / "backend" / "tests",
    REPO_ROOT / "web" / "frontend" / "src",
)
SUFFIXES = {".py", ".ts", ".tsx"}
BARE_MAIN = re.compile(r"^\s*main\s*$")


def test_no_stray_bare_main_tokens() -> None:
    offenders: list[str] = []
    for scan_dir in SCAN_DIRS:
        if not scan_dir.is_dir():
            continue
        for path in scan_dir.rglob("*"):
            if path.suffix not in SUFFIXES or not path.is_file():
                continue
            for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
                if BARE_MAIN.match(line):
                    offenders.append(f"{path.relative_to(REPO_ROOT)}:{lineno}")
    assert not offenders, (
        "Bare 'main' tokens found in source (likely paste corruption):\n"
        + "\n".join(f"  - {item}" for item in offenders)
    )


def test_ci_has_source_integrity_job() -> None:
    """The CI guard itself must stay wired so this protection can't regress."""
    ci_workflow = yaml.safe_load(
        (REPO_ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
    )
    integrity = ci_workflow["jobs"].get("integrity")
    assert integrity is not None, "CI is missing the 'integrity' job"

    steps = integrity["steps"]
    guard_steps = [
        step for step in steps
        if isinstance(step, dict)
        and step.get("name") == "Fail on stray bare 'main' tokens"
    ]
    assert guard_steps, "CI integrity job is missing the stray-token guard step"
    run_script = guard_steps[0]["run"]
    assert "rg -n '^\\s*main\\s*$'" in run_script, (
        "CI integrity job no longer scans for bare 'main' tokens"
    )
    assert "::error::" in run_script, (
        "CI integrity job should emit an error annotation when it fails"
    )
