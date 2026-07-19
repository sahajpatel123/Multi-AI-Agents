"""Regression: pin intent of the user-scoped rate limits on auth routes.

Cycle 60 pinned the registration route (5/hour/IP). This test pins
the user-scoped caps on /api/auth/logout, /api/auth/me, and
/api/auth/me/features. The behavioral rate-limit tests cover the
runtime trip; this file pins the cap *design* — the limit and
window values a future contributor might weaken without realizing
the security implication.

The user-scoped caps protect against:
  * /api/auth/logout (30/min): a hostile client can use repeated
    logout calls to churn the token-blacklist Redis table.
  * /api/auth/me (120/min): the profile shell hydrates on every
    page load; 120/min matches a worst-case tab-refresh rate.
  * /api/auth/me/features (120/min): feature-gate lookups; matched
    to /me's ceiling.

If a future contributor changes any of these (e.g. "just to be
safe, bump logout to 200/min"), the test fails with a clear message
about the original security intent.
"""

from __future__ import annotations

import re
from pathlib import Path


def _read_auth_src() -> str:
    return (
        Path(__file__).resolve().parent.parent / "arena" / "routes" / "auth.py"
    ).read_text()


def test_auth_logout_route_declares_the_30_per_minute_user_cap():
    """Pin scope='auth_logout' / limit=30 / window_seconds=60.

    Logout is write-ish (token blacklist insert) and the cap bounds
    the cost of a malicious logout-flood. 30/min is well above a
    reasonable user-initiated logout rate; lowering the cap could
    race with rapid-fire tab closes during normal use.
    """
    src = _read_auth_src()
    assert 'scope="auth_logout"' in src, (
        "Expected scope='auth_logout' on the logout route's user "
        "rate-limit call."
    )
    assert "limit=30" in src, (
        "Expected the logout user cap to remain at 30/min. The 30/min "
        "ceiling bounds token-blacklist churn from a hostile client "
        "without affecting normal multi-tab use."
    )
    assert "window_seconds=60" in src, (
        "Expected the logout cap to roll on a 60-second window."
    )


def test_auth_me_route_declares_the_120_per_minute_user_cap():
    """Pin scope='auth_me' / limit=120 / window_seconds=60.

    The profile shell hydrates on every page load; 120/min is a
    comfortable ceiling (one read every 500ms). Lower values break
    multi-tab navigation; higher values weaken the cap.
    """
    src = _read_auth_src()
    assert 'scope="auth_me"' in src, (
        "Expected scope='auth_me' on the /api/auth/me route's user "
        "rate-limit call."
    )
    assert "limit=120" in src, (
        "Expected the /api/auth/me cap to remain at 120/min. The "
        "120/min ceiling matches a worst-case tab-refresh rate; "
        "lower values break multi-tab navigation."
    )
    assert "window_seconds=60" in src, (
        "Expected the /api/auth/me cap to roll on a 60-second window."
    )


def test_auth_me_features_route_declares_the_120_per_minute_user_cap():
    """Pin scope='auth_me_features' / limit=120 / window_seconds=60.

    Feature-gate lookups are polled by every interactive component
    (pricing, paywall, upsell). 120/min matches /me's ceiling so a
    polling client doesn't trip just the features endpoint.
    """
    src = _read_auth_src()
    assert 'scope="auth_me_features"' in src, (
        "Expected scope='auth_me_features' on the /api/auth/me/features "
        "route's user rate-limit call."
    )
    assert "limit=120" in src, (
        "Expected the /api/auth/me/features cap to remain at 120/min. "
        "The 120/min ceiling matches /me's cap so a polling client "
        "doesn't trip just the features endpoint."
    )
    assert "window_seconds=60" in src, (
        "Expected the /api/auth/me/features cap to roll on a 60-second window."
    )