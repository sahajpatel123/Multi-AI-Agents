"""Shared admin gate for ops-only endpoints.

Until full RBAC ships, ADMIN_EMAIL is the single allow-list entry.
"""

from __future__ import annotations

from fastapi import HTTPException, status


def require_admin_email(user_email: str | None) -> None:
    """Raise 503 if admin is not configured, 403 if the caller is not admin."""
    from arena.config import get_settings

    settings = get_settings()
    admin = (settings.admin_email or "").strip().lower()
    if not admin:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "error": "admin_not_configured",
                "message": "Ops metrics are disabled until ADMIN_EMAIL is set.",
            },
        )
    if (user_email or "").strip().lower() != admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "admin_required",
                "message": "Admin access required.",
            },
        )
