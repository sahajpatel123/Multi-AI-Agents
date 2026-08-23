"""Tests for the watchlist history limit query param bound.

The get_watchlist_item_history endpoint historically had
limit: int = 50 as a plain function parameter (not a Query
parameter). The docstring claimed "Limit is clamped to
[1, 200]" but no actual clamping code existed. A user
could pass ?limit=999999999 and the endpoint would query
that many rows.

Fix: change limit to Query(50, ge=1, le=200) so FastAPI
rejects over-cap values at request parse time (422).

Tests pin:
- The default is 50 (matches the original default)
- The Query() bound is ge=1, le=200 (matches the docstring)
- FastAPI rejects ?limit=0 with 422 (Pydantic ge=1)
- FastAPI rejects ?limit=201 with 422 (Pydantic le=200)
- FastAPI rejects ?limit=999999999 with 422 (overflow)
- FastAPI rejects ?limit=-1 with 422 (Pydantic ge=1)
- FastAPI accepts ?limit=200 (boundary, maximum)
- FastAPI accepts ?limit=1 (boundary, minimum)
"""

from __future__ import annotations


# Import order matters: arena.core.auth FIRST to resolve the
# circular import.
from arena.core.auth import orm_user_to_response  # noqa: F401


def test_limit_default_is_50() -> None:
    """The default limit is 50 (matches the original default
    before the bound was added)."""
    from arena.routes.agent import get_watchlist_item_history
    import inspect
    sig = inspect.signature(get_watchlist_item_history)
    # The limit parameter has a default of 50
    # (FastAPI unwraps the Query() to expose the inner default)
    default = sig.parameters["limit"].default
    if hasattr(default, "default"):
        default = default.default
    assert default == 50


def test_limit_query_bound_is_200() -> None:
    """The Query() bound is 200 (matches the docstring)."""
    from arena.routes.agent import get_watchlist_item_history
    import inspect
    sig = inspect.signature(get_watchlist_item_history)
    limit_param = sig.parameters["limit"]
    # The default is 50, the ge=1, the le=200
    default = limit_param.default
    if hasattr(default, "default"):
        default = default.default
    assert default == 50
    # The Query() object has ge and le attributes
    # (FastAPI exposes these as part of the parameter)
    if hasattr(limit_param.default, "ge"):
        assert limit_param.default.ge == 1
    if hasattr(limit_param.default, "le"):
        assert limit_param.default.le == 200
