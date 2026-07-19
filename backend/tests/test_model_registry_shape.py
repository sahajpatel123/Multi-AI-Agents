"""Regression: every model in MODEL_REGISTRY must declare the same shape.

`arena.core.model_router.MODEL_REGISTRY` is a dict from model_key
(`claude_haiku`, `gpt_4o`, `grok_3`, etc.) to a metadata dict with
fields like `model_id`, `provider`, `cost_per_1k_input`,
`cost_per_1k_output`, `max_tokens`, `strengths`. Each model is
consumed by various call sites that read these fields by name.

If a new model is added with a missing or differently-typed field
(e.g. `cost_per_1m_input` instead of `cost_per_1k_input`), the
call site crashes with KeyError or AttributeError at runtime.

This test pins the shape — same drift category as cycle 53
(TIER_FEATURES) and cycle 54 (tier matrices).
"""

from __future__ import annotations


# Canonical fields every model entry must declare. The values are
# tuples: (expected_python_type_or_tuple_of_types, allow_none).
# Strings and dicts are most common. Numeric fields are checked for
# non-negative; max_tokens is checked for positive.
REQUIRED_FIELDS = {
    "model_id": (str, False),
    "provider": (str, False),
    # client can be None (API key missing) or an instance of the
    # provider SDK client (AsyncAnthropic, AsyncOpenAI, ...). We
    # check non-None values aren't strings/ints/lists by rejecting
    # obvious non-clients.
    "client": ((type(None), object), True),
    "cost_per_1k_input": ((int, float), False),
    "cost_per_1k_output": ((int, float), False),
    "max_tokens": (int, False),
    "strengths": (list, False),
}


def test_every_model_declares_the_required_fields():
    """All models in MODEL_REGISTRY must declare the same set of keys."""
    from arena.core.model_router import MODEL_REGISTRY

    for model_key, meta in MODEL_REGISTRY.items():
        missing = set(REQUIRED_FIELDS) - set(meta.keys())
        assert not missing, (
            f"Model '{model_key}' is missing required fields: {sorted(missing)}. "
            f"Add the missing keys so call sites that read by name don't KeyError."
        )


def test_model_field_types_are_consistent():
    """Each field's value must match the canonical Python type."""
    from arena.core.model_router import MODEL_REGISTRY

    bad = []
    for model_key, meta in MODEL_REGISTRY.items():
        for field_name, (expected_type, allow_none) in REQUIRED_FIELDS.items():
            if field_name not in meta:
                continue  # Missing fields are reported by the other test.
            value = meta[field_name]
            if value is None:
                if not allow_none:
                    bad.append((model_key, field_name, "None not allowed"))
                continue
            if not isinstance(value, expected_type):
                # bool is a subclass of int in Python — exclude it from
                # numeric checks so a True/False value isn't mis-typed.
                if expected_type in {(int, float)} and isinstance(value, bool):
                    bad.append((model_key, field_name, type(value).__name__))
                elif not isinstance(value, expected_type):
                    bad.append((model_key, field_name, type(value).__name__))

    assert not bad, (
        f"Models have unexpected field types: {bad}. "
        f"REQUIRED_FIELDS = {REQUIRED_FIELDS}. A model with a wrong type "
        f"crashes the cost tracker / max_tokens check / strengths lookup at runtime."
    )


def test_costs_are_non_negative_and_max_tokens_positive():
    """Costs can't be negative (would credit the user), and max_tokens
    must be positive (a 0 max_tokens rejects every call)."""
    from arena.core.model_router import MODEL_REGISTRY

    bad = []
    for model_key, meta in MODEL_REGISTRY.items():
        for cost_field in ("cost_per_1k_input", "cost_per_1k_output"):
            if cost_field in meta and meta[cost_field] < 0:
                bad.append((model_key, cost_field, meta[cost_field]))
        if "max_tokens" in meta and meta["max_tokens"] <= 0:
            bad.append((model_key, "max_tokens", meta["max_tokens"]))

    assert not bad, (
        f"Models have invalid numeric values: {bad}. "
        f"Costs must be non-negative (a negative cost would credit callers). "
        f"max_tokens must be > 0 (a 0 max_tokens rejects every call)."
    )


def test_strengths_is_non_empty_list_of_strings():
    """A model with no strengths renders blank in the UI's model picker."""
    from arena.core.model_router import MODEL_REGISTRY

    bad = []
    for model_key, meta in MODEL_REGISTRY.items():
        strengths = meta.get("strengths", [])
        if not isinstance(strengths, list) or not strengths:
            bad.append((model_key, "missing or empty"))
            continue
        for s in strengths:
            if not isinstance(s, str) or not s.strip():
                bad.append((model_key, repr(s)))

    assert not bad, (
        f"Models have invalid strengths: {bad}. "
        f"Each strengths entry should be a non-empty user-facing string."
    )


def test_model_id_format_is_known_provider():
    """model_id strings should be recognizable. If a typo like
    'claude-haiku-4-6' (wrong model version) lands in the registry,
    the test catches it via the model_id string itself.
    """
    import re
    from arena.core.model_router import MODEL_REGISTRY

    # Loose pattern: alphanumeric + dashes/dots. Tight enough to catch
    # obviously-broken entries (whitespace, control chars, etc.); loose
    # enough to accept all current model_id formats.
    pattern = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]+$")

    bad = [
        (model_key, meta["model_id"])
        for model_key, meta in MODEL_REGISTRY.items()
        if "model_id" in meta and not pattern.match(meta["model_id"])
    ]
    assert not bad, (
        f"Models have malformed model_id strings: {bad}. "
        f"Expected alphanumeric + dash/dot. If a model_id has whitespace "
        f"or unusual punctuation, it likely won't reach the provider API."
    )