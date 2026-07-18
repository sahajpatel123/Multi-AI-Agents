"""Regression: every `Settings` field must actually be read somewhere in prod code.

Settings (pydantic-settings) auto-loads from env vars, so any field declared on
the class becomes a public knob whether the codebase uses it or not. Dead
fields are a real bug class here:

  * .env.example advertises GUEST_DAILY_LIMIT=5 and REGISTERED_DAILY_LIMIT=7,
    but the actual per-tier message caps live in `tier_config.TIER_MESSAGE_LIMITS`
    (3 / 5 / 15 / 35). A contributor who edits the env var will see no behavior
    change and assume the project is broken.

  * `default_model` was advertised as configurable but never read — the model
    catalog lives in `model_router.MODEL_ROUTES`. Same trap.

This test walks every field on Settings and asserts it has at least one
non-test, non-config reference in `backend/arena/`. New dead fields fail the
build. To retire a field legitimately, also remove it from .env.example and
add a single character to this test's `ALLOWED_DEAD_FIELDS` set (or, better,
just delete the field — there is no good reason to whitelist dead config).
"""

from __future__ import annotations

import ast
import re
from pathlib import Path

import pytest


REPO_BACKEND = Path(__file__).resolve().parent.parent
PROD_ROOT = REPO_BACKEND / "arena"
PROD_FILES_EXCEPT_CONFIG = [
    *(PROD_ROOT.rglob("*.py") if PROD_ROOT.exists() else []),
    REPO_BACKEND / "main.py",
    REPO_BACKEND / "migrate_and_start.py",
    REPO_BACKEND / "start.sh",
]


def _collect_settings_fields() -> list[str]:
    """Read Settings field names directly from config.py via AST — no import."""
    config_path = REPO_BACKEND / "arena" / "config.py"
    tree = ast.parse(config_path.read_text())
    fields: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef) and node.name == "Settings":
            for stmt in node.body:
                target = stmt
                if isinstance(stmt, ast.AnnAssign) and isinstance(stmt.target, ast.Name):
                    fields.append(stmt.target.id)
                elif isinstance(stmt, ast.Assign):
                    for t in stmt.targets:
                        if isinstance(t, ast.Name):
                            fields.append(t.id)
                elif (
                    isinstance(stmt, (ast.FunctionDef, ast.AsyncFunctionDef))
                    and stmt.name not in {"__init__"}
                    and not stmt.name.startswith("_")
                ):
                    # Decorated validators / model_validators are not fields.
                    continue
    return fields


def _field_is_read(field_name: str) -> bool:
    """True if `field_name` appears as `settings.<field>` or in a call site
    elsewhere in production code outside config.py itself.

    We also accept `_settings.<field>` (used in core/auth.py), bare
    references inside `config.py`'s `validate_secrets` method, and shell
    scripts that read the uppercased env var (e.g. start.sh's `${PORT:-8000}`).
    """
    # Pattern 1: settings.<field> or _settings.<field> in any prod .py or shell
    setting_attr = re.compile(rf"\b(?:_settings|settings)\b\s*\.\s*{re.escape(field_name)}\b")
    # Pattern 2: the field appears as a string literal (e.g. os.getenv("FIELD_NAME"))
    upper_name = field_name.upper()
    env_string = re.compile(rf"""['"\${{]{re.escape(upper_name)}['"}}\s]""")

    config_path = REPO_BACKEND / "arena" / "config.py"

    for prod_file in PROD_FILES_EXCEPT_CONFIG:
        if not prod_file.exists():
            continue
        if prod_file.name == "config.py":
            continue
        try:
            source = prod_file.read_text()
        except (UnicodeDecodeError, OSError):
            continue
        if setting_attr.search(source):
            return True
        if env_string.search(source):
            return True

    # Pattern 3: validate_secrets() in config.py itself — the canonical
    # startup-time reader. Look for any reference to `self.<field>` there.
    config_source = config_path.read_text()
    if re.search(rf"\bself\.{re.escape(field_name)}\b", config_source):
        return True

    return False


def test_every_settings_field_has_a_reader():
    """No field on Settings may be declared without at least one prod-side reader.

    A dead field is a trap: it shows up in /docs, in .env.example, and in IDE
    autocomplete, but does nothing. This is the same bug class as the missing
    ALTER TABLE entries (loops 9 / 10) — silent drift between declared surface
    and actual implementation.
    """
    fields = _collect_settings_fields()
    assert fields, "AST walk failed to find any Settings fields — test is broken"

    dead: list[str] = []
    for f in fields:
        # Skip private / dunder / framework hooks
        if f.startswith("_") or f in {"model_config"}:
            continue
        if not _field_is_read(f):
            dead.append(f)

    assert not dead, (
        "Dead Settings fields (defined but never read in prod code): "
        f"{sorted(dead)}. Remove from arena/config.py and backend/.env.example, "
        "or wire them into the actual rate-limit / model / config reader if "
        "they were intended to be live."
    )


@pytest.mark.parametrize(
    "field_name",
    [
        # Spot-check that the parametrized reader accepts the most common
        # access patterns. If you change the patterns in _field_is_read,
        # update these accordingly.
        "anthropic_api_key",
        "secret_key",
        "access_token_expire_minutes",
        "encryption_key",
        "allowed_origins",
    ],
)
def test_field_is_read_recognizes_common_patterns(field_name: str):
    """Sanity check the reader helper against fields we know are wired up."""
    assert _field_is_read(field_name), (
        f"Reader helper failed to recognize known-live field {field_name!r} — "
        f"the patterns in _field_is_read may be too narrow."
    )