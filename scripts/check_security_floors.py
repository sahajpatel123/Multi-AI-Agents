#!/usr/bin/env python3
"""Security pin-floor guard for backend dependencies.

Run from the repository root:

    python scripts/check_security_floors.py

This replaces the inline ``python -c "..."`` block that previously lived in
ci.yml. Embedding Python inside a bash double-quoted string made the guard
one stray backtick away from executing arbitrary shell (a comment containing
`` `pip show` `` literally triggered command substitution and failed every
run). As a real script it is testable, diffable, and free of quoting traps.

Enforced invariants:

  * every package in REQUIRED stays at or above its security floor —
    a downgrade below the floor fails the build;
  * packages in FORBIDDEN must not appear as direct pins in
    backend/requirements.txt;
  * packages in FORBIDDEN must not be resolvable in the live environment,
    including as transitive dependencies of anything else installed.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REQUIREMENTS_PATH = ROOT / "backend" / "requirements.txt"

# Defense-in-depth: even if a future pip-audit database update silently drops
# a vulnerable-package match, the floors below must stay. A regression to any
# older pin fails the build. Keep this mapping in sync with SECURITY.md.
REQUIRED = {
    "fastapi": "0.139.2",
    "pyasn1": "0.6.4",
    "PyJWT": "2.13.0",
    "python-multipart": "0.0.32",
    "cryptography": "50.0.0",
    "Pillow": "12.3.0",
    "python-dotenv": "1.2.2",
    "markdown": "3.8.1",
    "weasyprint": "69.0",
    "pytest": "9.0.3",
}

# Packages that MUST NOT appear — directly in requirements.txt or anywhere in
# the resolved environment. python-jose pulls ecdsa 0.19.2 (PYSEC-2026-1325,
# Minerva timing attack) and was eliminated in favor of PyJWT.
FORBIDDEN = {
    "python-jose": "pulls ecdsa 0.19.2 (PYSEC-2026-1325); use PyJWT",
    "ecdsa": "transitive of python-jose; eliminated via PyJWT",
}


def _version_key(version: str) -> tuple[int, ...]:
    return tuple(int(part) for part in version.split("."))


def check_pin_floors(text: str) -> list[str]:
    """Return violations for missing pins or pins below their floor."""
    failures: list[str] = []
    for package, min_version in REQUIRED.items():
        pattern = rf"^{re.escape(package)}(?:\[.*?\])?==(\d+(?:\.\d+)+)"
        match = re.search(pattern, text, re.MULTILINE)
        if not match:
            failures.append(f"MISSING: {package}=={min_version}")
            continue
        if _version_key(match.group(1)) < _version_key(min_version):
            failures.append(
                f"REGRESSED: {package}=={match.group(1)} (require >= {min_version})"
            )
    return failures


def check_forbidden_direct(text: str) -> list[str]:
    """Return violations for forbidden packages pinned in requirements.txt."""
    hits: list[str] = []
    for package, why in FORBIDDEN.items():
        pattern = rf"^{re.escape(package)}(?:\[.*?\])?(?:==|>=|~=|@)"
        if re.search(pattern, text, re.MULTILINE):
            hits.append(f"FORBIDDEN (direct): {package} — {why}")
    return hits


def _dep_name(raw_requirement: str) -> str:
    """Reduce a Requires-Dist string like 'name[extras]>=1.0' to 'name'."""
    head = raw_requirement.split("[", 1)[0]
    for separator in (" ", "<", ">", "=", "!", "~", ";"):
        head = head.split(separator, 1)[0]
    return head.strip()


def check_forbidden_resolved() -> list[str]:
    """Return violations for forbidden packages installed in this environment.

    A future transitive reintroducer (someone adds a library that pulls
    python-jose) slips past the requirements.txt grep above, so also walk the
    live environment via importlib.metadata. The why-message names who
    requires the offender so the committer knows whether to drop a direct pin
    or chase a transitive reintroducer.
    """
    import importlib.metadata

    hits: list[str] = []
    distributions = list(importlib.metadata.distributions())
    for package, why in FORBIDDEN.items():
        try:
            dist = importlib.metadata.distribution(package)
        except importlib.metadata.PackageNotFoundError:
            continue
        version = dist.version or "?"
        required_by = ",".join(
            sorted(
                other.metadata["Name"]
                for other in distributions
                if other.metadata["Name"]
                for requirement in other.requires or []
                if requirement and _dep_name(requirement) == package
            )
        )
        suffix = f" | Required-by: {required_by}" if required_by else ""
        hits.append(f"FORBIDDEN (resolved): {package} {version}{suffix} — {why}")
    return hits


def main() -> int:
    text = REQUIREMENTS_PATH.read_text(encoding="utf-8")
    failures = check_pin_floors(text)
    forbidden_hits = check_forbidden_direct(text) + check_forbidden_resolved()

    if failures or forbidden_hits:
        print("Security floor violations:")
        for violation in failures + forbidden_hits:
            print(f"  - {violation}")
        return 1

    print(f"Security floor OK ({len(REQUIRED)} floors, {len(FORBIDDEN)} banned)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
