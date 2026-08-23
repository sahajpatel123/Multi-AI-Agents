"""Behavioral regression tests for the security pin-floor guard.

The guard used to live inside a `python -c "..."` heredoc embedded in
`.github/workflows/ci.yml`. Embedding Python in bash made it invisible
to pytest and one stray backtick away from shell injection into its own
comment text — which is exactly how it broke every CI run (cycle-79).
It now lives in ``scripts/check_security_floors.py`` as a plain module,
so these tests exercise the real implementation instead of grepping
workflow YAML.

Two layers are guarded here:

  1. Wiring — ci.yml must still invoke the script, and the script must
     expose the floors/bans established by past security audits. A
     refactor that silently disconnects either side fails these tests.
  2. Behavior — the checking functions themselves, against synthetic
     requirements.txt content: clean trees pass, regressed pins fail,
     missing pins fail, and forbidden packages (direct or transitive)
     are caught.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "check_security_floors.py"
WORKFLOW = ROOT / ".github" / "workflows" / "ci.yml"


@pytest.fixture(scope="module")
def guard():
    spec = importlib.util.spec_from_file_location("check_security_floors", SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# --------------------------------------------------------------------------
# Layer 1: wiring
# --------------------------------------------------------------------------


def test_script_exists():
    assert SCRIPT.exists(), f"guard script missing at {SCRIPT}"


def test_ci_invokes_the_guard_script():
    """The 'Pin floor guard' step must call the extracted script.

    Guards against a workflow edit dropping the invocation while the
    script itself keeps passing locally — CI would silently lose the
    floor enforcement.
    """
    import re

    text = WORKFLOW.read_text()
    match = re.search(
        r"name:\s*Pin floor guard[^\n]*\n(?P<body>.*?)(?=^\s*- name:)",
        text,
        re.DOTALL | re.MULTILINE,
    )
    assert match, "Pin floor guard step not found in ci.yml"
    assert "scripts/check_security_floors.py" in match.group("body")


def test_forbidden_entries_include_python_jose_and_ecdsa(guard):
    """The cycle-1 migration dropped python-jose; the FORBIDDEN list
    must still guard against its reintroduction."""
    assert "python-jose" in guard.FORBIDDEN
    assert "ecdsa" in guard.FORBIDDEN
    assert "PYSEC-2026-1325" in str(guard.FORBIDDEN)


def test_required_floor_dict_present(guard):
    """The REQUIRED pin-floor dict must list at least the packages the
    cycle-1+ security audits established as floor-critical."""
    for pkg in (
        "fastapi",
        "pyasn1",
        "PyJWT",
        "python-multipart",
        "cryptography",
        "Pillow",
        "python-dotenv",
        "markdown",
        "weasyprint",
        "pytest",
    ):
        assert pkg in guard.REQUIRED, f"REQUIRED floor missing for {pkg}"


def test_resolved_tree_walk_present(guard):
    """Transitive reintroducers are caught via importlib.metadata."""
    source = Path(guard.__file__).read_text()
    assert "importlib.metadata" in source
    assert "distributions()" in source


def test_main_prints_success_marker_on_clean(guard, tmp_path, monkeypatch, capsys):
    """The guard ends with a clear success marker so CI logs show it ran
    (vs. silently no-op'ing on a malformed rewrite)."""
    clean_text = "".join(
        f"{pkg}=={ver}\n" for pkg, ver in guard.REQUIRED.items()
    )
    fake_requirements = tmp_path / "requirements.txt"
    fake_requirements.write_text(clean_text)
    monkeypatch.setattr(guard, "REQUIREMENTS_PATH", fake_requirements)
    # A clean environment must not carry forbidden packages either; the
    # test process's own environment qualifies only if it is clean, so
    # force the resolved-tree walk to see nothing installed.
    monkeypatch.setattr(guard, "check_forbidden_resolved", list)
    assert guard.main() == 0
    out = capsys.readouterr().out
    assert "Security floor OK" in out


# --------------------------------------------------------------------------
# Layer 2: behavior
# --------------------------------------------------------------------------


# Snapshot of the floors at the time these tests were written; behavioral
# tests below use it as synthetic input so they stay meaningful even if
# test_required_floor_dict_present later allows new floors to be added.
guard_REQUIRED_SNAPSHOT = {
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


def _requirements_text(**overrides) -> str:
    pins = dict(guard_REQUIRED_SNAPSHOT)
    pins.update(overrides)
    return "".join(f"{pkg}=={ver}\n" for pkg, ver in pins.items())


def test_clean_pins_pass(guard):
    assert guard.check_pin_floors(_requirements_text()) == []


def test_regressed_pin_is_caught(guard):
    text = _requirements_text(cryptography="49.9.9")
    failures = guard.check_pin_floors(text)
    assert any("REGRESSED: cryptography==49.9.9" in f for f in failures)


def test_missing_pin_is_caught(guard):
    text = "\n".join(
        line
        for line in _requirements_text().splitlines()
        if not line.startswith("PyJWT==")
    )
    failures = guard.check_pin_floors(text)
    assert failures == ["MISSING: PyJWT==2.13.0"]


def test_extra_pins_do_not_disturb_the_guard(guard):
    text = _requirements_text() + "some-unrelated-package==1.0.0\n"
    assert guard.check_pin_floors(text) == []


def test_forbidden_direct_pin_is_caught(guard):
    hits = guard.check_forbidden_direct("python-jose[cryptography]==3.3.0\n")
    assert len(hits) == 1
    assert "FORBIDDEN (direct): python-jose" in hits[0]


def test_dep_name_strips_extras_and_specifiers(guard):
    assert guard._dep_name("ecdsa>=0.19.0") == "ecdsa"
    assert guard._dep_name("python-jose[cryptography]==3.5.0") == "python-jose"
    assert guard._dep_name("ecdsa ; python_version < '3.11'") == "ecdsa"


def test_check_forbidden_resolved_returns_list(guard):
    """Smoke: the resolved-tree walk runs against the live environment
    and returns violations only for installed forbidden packages."""
    result = guard.check_forbidden_resolved()
    assert isinstance(result, list)
    for hit in result:
        assert hit.startswith("FORBIDDEN (resolved):")


# --------------------------------------------------------------------------
# Frontend floors (migrated out of ci.yml's inline node -e block)
# --------------------------------------------------------------------------


def test_ci_no_longer_embeds_the_node_inline_guard():
    """The node -e pin-floor block must stay out of ci.yml — its floors
    live in scripts/check_security_floors.py now. If this fails, someone
    re-inlined interpreter code into a bash string (the quoting-trap class
    of bug that broke CI before)."""
    text = WORKFLOW.read_text()
    assert "node -e" not in text, "inline node code reintroduced into ci.yml"
    assert "react-router-dom" not in text, "frontend floors belong in the script"


def test_frontend_floor_dict_present(guard):
    for pkg in ("react-router-dom", "postcss", "vitest"):
        assert pkg in guard.FRONTEND_REQUIRED, f"frontend floor missing: {pkg}"


def _package_json(**overrides) -> dict:
    pins = {
        "react-router-dom": "^7.14.2",
        "postcss": "^8.5.23",
        "vitest": "^4.1.10",
    }
    pins.update(overrides)
    return {"dependencies": {}, "devDependencies": pins}


def test_frontend_clean_pins_pass(guard):
    assert guard.check_frontend_floors(_package_json()) == []


def test_frontend_regressed_pin_is_caught(guard):
    failures = guard.check_frontend_floors(_package_json(postcss="^8.4.0"))
    assert any("REGRESSED: postcss@8.4.0" in f for f in failures)


def test_frontend_missing_pin_is_caught(guard):
    pins = _package_json()
    pins["devDependencies"].pop("vitest")
    failures = guard.check_frontend_floors(pins)
    assert failures == ["MISSING: vitest>=4.1.10"]


def test_frontend_unparseable_range_is_caught(guard):
    failures = guard.check_frontend_floors(_package_json(vitest="workspace:*"))
    assert any("UNPARSED: vitest = workspace:*" in f for f in failures)
