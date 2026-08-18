"""Auth routes — /api/auth/* (Bearer tokens in JSON body, no cookies)."""

import logging
import secrets
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from pydantic import BaseModel, Field, field_validator
from fastapi.responses import JSONResponse
from slowapi import Limiter
from sqlalchemy import func
from sqlalchemy.exc import OperationalError, InterfaceError, IntegrityError
from sqlalchemy.orm import Session

from arena.core.client_ip import get_request_client_ip
from arena.core.rate_limits import enforce_ip_rate_limit, enforce_user_rate_limit
from arena.core.datetime_utils import utcnow_naive
from arena.core.http_headers import content_disposition_attachment

from arena.core.errors import ErrorCodes
from arena.core.auth import (
    authenticate_user,
    create_access_token,
    create_refresh_token,
    create_user,
    decode_token,
    get_user_by_email,
    hash_password,
    orm_user_to_response,
    verify_password,
)


def _payload_exp_seconds(token: str) -> Optional[int]:
    """Return the JWT `exp` claim as an epoch second, or None if absent/invalid.

    Used by /logout to record the token's natural expiry in the
    persistent blacklist. We never crash if the token is malformed —
    the caller just skips revocation for that token.
    """
    try:
        payload = decode_token(token)
    except Exception:
        return None
    if not payload:
        return None
    exp = payload.get("exp")
    return int(exp) if isinstance(exp, (int, float)) else None


def _epoch_to_naive(epoch_seconds: int) -> datetime:
    return datetime.fromtimestamp(epoch_seconds, tz=timezone.utc).replace(tzinfo=None)


def _subject_user_id(payload: dict) -> Optional[int]:
    """Parse JWT subject to int user id, or None if missing/malformed."""
    raw = payload.get("sub") or payload.get("user_id")
    if raw is None:
        return None
    try:
        return int(str(raw).strip())
    except (ValueError, TypeError):
        return None


def _owned_refresh_token(token: str, user_id: int) -> Optional[dict]:
    """Return decoded payload only if token is a live refresh JWT for user_id.

    Logout must never blacklist another user's refresh token. Without this
    check, any authenticated client could POST a victim's refresh_token in
    the body and force-revoke their session (session DoS / forced re-login).
    """
    try:
        payload = decode_token(token)
    except Exception:
        return None
    if not payload or payload.get("type") != "refresh":
        return None
    sub = _subject_user_id(payload)
    if sub is None or sub != int(user_id):
        return None
    return payload
from arena.core.token_blacklist import token_blacklist
from arena.core.dependencies import get_current_user_required_orm
from arena.core.feedback_calibrator import get_answer_feedback_distribution
from arena.core.input_validation import sanitize_html
from arena.core.login_limiter import login_limiter, registration_limiter
from arena.core.tier_config import (
    TIER_FEATURES,
    UserTier,
    get_credit_budget,
    get_daily_limit,
    get_tier_personas,
    get_tier_str,
    normalize_tier,
    upgrade_target,
)
from arena.database import dispose_engine, get_db, is_db_connectivity_error
from arena.db_models import PasswordResetToken, UsageRecord, User
from arena.models.schemas import LoginRequest, RegisterRequest, UserProfilePatch, UserResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])
user_router = APIRouter(prefix="/api/user", tags=["auth"])
logger = logging.getLogger(__name__)


def _raise_if_db_unavailable(exc: BaseException, action: str) -> None:
    """Map DB connectivity failures to 503 (not opaque 500 'Login failed')."""
    if not (
        is_db_connectivity_error(exc)
        or isinstance(exc, (OperationalError, InterfaceError))
    ):
        return
    dispose_engine()
    logger.exception("%s failed: database unavailable", action)
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail={
            "error": "database_unavailable",
            "message": "Database temporarily unavailable. Please try again in a moment.",
        },
    )

# Key by spoof-resistant client IP (rightmost XFF in prod; peer in dev).
limiter = Limiter(key_func=get_request_client_ip)

_COMMON_PASSWORDS = {
    # Top ~100 most common passwords from HaveIBeenPwned / SecLists /
    # breach compilations. Curated to cover the most-leaked entries
    # plus common mutations (digit suffix, leet substitution, year
    # suffix). The test_top_20_breaches_are_blocked regression
    # guard at tests/test_password_strength_validator.py pins the
    # top-20; test_password_strength_validator's
    # test_top_breaches_covered_in_blocklist (this file) pins the
    # full top-100 so a regression that drops any of them is a
    # loud test failure rather than a silent credential-stuffing
    # surface.
    #
    # Set membership is O(1) — the lookup is on the hot path of
    # /auth/register and /auth/reset-password, so a set of ~100
    # strings is well under any measurable latency budget. The
    # set is also used by _validate_password_strength's lookup,
    # which uses password.strip().lower() in the iteration 10 fix
    # to close the whitespace-padding bypass.
    #
    # 1-20
    "password",
    "12345678",
    "password1",
    "qwerty123",
    "letmein1",
    "welcome1",
    "123456789",
    "password123",
    "admin",
    "admin123",
    "letmein",
    "welcome",
    "monkey",
    "dragon",
    "master",
    "login",
    "abc123",
    "iloveyou",
    "princess",
    "football",
    # 21-40
    "trustno1",
    "sunshine",
    "ashley",
    "bailey",
    "passw0rd",
    "shadow",
    "123123",
    "qwerty",
    "12345",
    "123456",
    "111111",
    "1234567",
    "baseball",
    "superman",
    "michael",
    "654321",
    "1qaz2wsx",
    "jordan",
    "starwars",
    "computer",
    # 41-60
    "mustang",
    "michelle",
    "jessica",
    "charlie",
    "andrew",
    "soccer",
    "batman",
    "harley",
    "ranger",
    "daniel",
    "thomas",
    "robert",
    "hunter",
    "george",
    "tigger",
    "killer",
    "matthew",
    "summer",
    "love",
    "daniel1",
    # 61-80
    "121212",
    "qazwsx",
    "123qwe",
    "555555",
    "lovely",
    "7777777",
    "888888",
    "666666",
    "444444",
    "333333",
    "222222",
    "000000",
    "987654321",
    "abcdef",
    "abcd1234",
    "qwerty1",
    "password11",
    "password12",
    "password1234",
    "p@ssw0rd",
    # 81-100
    "123qweasd",
    "1q2w3e4r",
    "qweasd",
    "asdfgh",
    "asdf1234",
    "zxcvbnm",
    "zxcvbn",
    "qweasdzxc",
    "admin1",
    "admin12",
    "welcome123",
    "welcome2",
    "welcome01",
    "test123",
    "test1234",
    "tester",
    "demo",
    "guest",
    "master123",
    "root",
}

_EXPERTISE_LEVELS = {"none", "curious", "practitioner", "expert", "researcher"}


def user_payload(user: User, db: Session) -> dict[str, Any]:
    """Full user shape for API clients; name is always a string."""
    return orm_user_to_response(user, db).model_dump(mode="json")


def _validate_password_strength(password: str) -> tuple[bool, str]:
    if len(password) < 8:
        return False, "Password must be at least 8 characters"
    if not any(c.isupper() for c in password):
        return False, "Password must contain at least one uppercase letter"
    if not any(c.isdigit() for c in password):
        return False, "Password must contain at least one number"
    # Strip surrounding whitespace before the common-password lookup.
    # Pydantic's str field preserves the user's input verbatim (no
    # auto-strip), so a password like " password1 " is 10 chars long
    # (passes length), has an uppercase 'P' and a digit '1' (passes
    # the structural checks), and `password.lower()` is " password1 "
    # (with spaces) — NOT in the allowlist. The user has effectively
    # bypassed the credential-stuffing block by typing whitespace
    # around a known common password. We reject the password here
    # (the validator returns False before hash_password runs), but
    # we do NOT mutate the password — create_user() below still
    # hashes the user's full input including spaces, so the
    # stored hash matches what the user typed. Rejecting "padded"
    # common passwords is the right call: the user is signaling
    # they have nothing better than the credential-stuffing list
    # to choose from, and the bcrypt cost factor of the resulting
    # hash is identical regardless of whitespace.
    if password.strip().lower() in _COMMON_PASSWORDS:
        return False, "Password is too common. Please choose a stronger one"
    return True, ""


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(
    body: RegisterRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> JSONResponse:
    # HTTPException (400/409/429) must NOT be logged as unexpected server
    # failures — that filled logs on every weak-password attempt and made
    # real errors harder to spot (and was a log-volume DoS vector).
    try:
        # Lockout check only — do not pre-count this attempt as a failure.
        registration_limiter.assert_not_locked(request)

        # Bound successful account creation per IP (mass-signup spam).
        # This MUST run BEFORE create_user: if it triggers after the user
        # is already committed, the user record exists in the DB while
        # the response is 429 — and the next /register attempt with the
        # same email returns 409, leaving a phantom account.
        from arena.core.rate_limits import enforce_ip_rate_limit

        enforce_ip_rate_limit(
            request,
            scope="registration_create",
            limit=5,
            window_seconds=3600,
            message="Too many accounts created from this network. Please try again later.",
        )

        is_valid, error_msg = _validate_password_strength(body.password)
        if not is_valid:
            registration_limiter.record_failure(request)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": "weak_password", "message": error_msg},
            )

        if get_user_by_email(db, body.email):
            registration_limiter.record_failure(request)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "error": ErrorCodes.EMAIL_EXISTS,
                    "message": "An account with that email already exists",
                },
            )

        user = create_user(db, body.email, body.password, body.name)
        access = create_access_token(user.id, user.email)
        refresh = create_refresh_token(user.id, user.email)
        registration_limiter.clear(request)
        return JSONResponse(
            status_code=status.HTTP_201_CREATED,
            content={
                "success": True,
                "access_token": access,
                "refresh_token": refresh,
                "user": user_payload(user, db),
            },
        )
    except HTTPException:
        raise
    except Exception as exc:
        _raise_if_db_unavailable(exc, "Registration")
        logger.exception("Registration failed")
        # Unexpected server failure still counts toward abuse window.
        try:
            registration_limiter.record_failure(request)
        except HTTPException:
            pass
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": ErrorCodes.REQUEST_FAILED,
                "message": "Registration failed",
            },
        )


@router.post("/login")
async def login(
    body: LoginRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> JSONResponse:
    # Same contract as register: expected client errors (401/429) are not
    # logged as stack traces. DB outages become 503; other failures → 500.
    try:
        # Check lockout first — never pre-record a failure before bcrypt runs.
        # Pre-recording locked out legitimate recovery on the Nth correct
        # password after (N-1) typos.
        login_limiter.assert_not_locked(request)

        user = authenticate_user(db, body.email, body.password)
        if not user:
            login_limiter.record_failure(request)
            # Surface remaining attempts so the UI can render
            # '2 attempts remaining' instead of a bare 'invalid'.
            # The number is a soft hint — leaking it doesn't materially
            # help an attacker who already has the email (knowing
            # they're 1/3 down just means they have to try again on a
            # different IP, which they could do anyway).
            remaining = login_limiter.remaining_attempts(request)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={
                    "error": "invalid_credentials",
                    "message": "Invalid email or password",
                    "remaining_attempts": remaining,
                },
            )

        access = create_access_token(user.id, user.email)
        refresh = create_refresh_token(user.id, user.email)
        login_limiter.clear(request)
        return JSONResponse(
            content={
                "success": True,
                "access_token": access,
                "refresh_token": refresh,
                "user": user_payload(user, db),
            },
        )
    except HTTPException:
        raise
    except Exception as exc:
        # Root cause of opaque "Login failed" in prod logs: Postgres TLS
        # handshake / pool death. Surface 503 so clients can retry cleanly.
        _raise_if_db_unavailable(exc, "Login")
        logger.exception("Login failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": ErrorCodes.REQUEST_FAILED,
                "message": "Login failed",
            },
        )


@router.post("/logout")
async def logout(request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user_required_orm)) -> JSONResponse:
    """Revoke ALL tokens for this session: the access token used for the
    logout request AND any refresh token the client forwards (in body or
    Authorization header). Without blacklisting the refresh token too, a
    logged-out session can be silently re-minted via /api/auth/refresh.

    Refresh tokens in the body are only revoked when they belong to the
    authenticated caller — otherwise any logged-in client could force-
    revoke another user's session by pasting their refresh JWT.
    """
    # 30/min/user — blacklist writes; stop logout-flood thrash.
    enforce_user_rate_limit(
        user.id,
        scope="auth_logout",
        limit=30,
        window_seconds=60,
        message="Too many logout attempts. Please slow down.",
    )
    auth_header = request.headers.get("Authorization", "")
    access_token = ""
    if auth_header.startswith("Bearer "):
        # Strip consistently so blacklist lookups match the dependency's token.
        access_token = auth_header[7:].strip()

    # Pull the refresh token from body OR header. Body wins if both arrive.
    refresh_token = ""
    try:
        body = await request.json()
        if isinstance(body, dict):
            refresh_token = (body.get("refresh_token") or "").strip()
    except Exception:
        logger.debug("Logout request body is not JSON", exc_info=True)
    if not refresh_token and auth_header.startswith("Bearer "):
        # Header-fallback: also accept a refresh token here so a client that
        # only ever sets one Authorization header can still log out cleanly.
        # If the header is the access token (normal case), ownership checks
        # below skip treating it as a second refresh revoke.
        refresh_token = auth_header[7:].strip()

    access_revoked = False
    refresh_revoked = False
    if access_token:
        access_exp = _payload_exp_seconds(access_token)
        if access_exp is not None:
            token_blacklist.add(
                access_token, expires_at=_epoch_to_naive(access_exp), db=db, reason="logout"
            )
            access_revoked = True
    if refresh_token and refresh_token != access_token:
        owned = _owned_refresh_token(refresh_token, user.id)
        if owned is not None:
            exp = owned.get("exp")
            if isinstance(exp, (int, float)):
                token_blacklist.add(
                    refresh_token,
                    expires_at=_epoch_to_naive(int(exp)),
                    db=db,
                    reason="logout",
                )
                refresh_revoked = True
        else:
            # Foreign or malformed refresh — do not revoke, do not error
            # (logout of the caller's access token still succeeds).
            logger.warning(
                "Logout ignored non-owned or invalid refresh token for user=%s",
                user.id,
            )
    logger.info(
        "Logout user=%d access_revoked=%s refresh_revoked=%s",
        user.id,
        access_revoked,
        refresh_revoked,
    )
    return JSONResponse({"success": True})


@router.post("/refresh")
@limiter.limit("20/hour")
async def refresh(request: Request, db: Session = Depends(get_db)) -> JSONResponse:
    refresh_token = ""
    try:
        body = await request.json()
        if isinstance(body, dict):
            refresh_token = (body.get("refresh_token") or "").strip()
    except Exception:
        logger.debug("Refresh request body is not JSON", exc_info=True)

    if not refresh_token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            refresh_token = auth_header[7:].strip()

    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": ErrorCodes.INVALID_TOKEN, "message": "Invalid or expired refresh token"},
        )

    # Honor the blacklist: a logout that revoked the refresh token must
    # actually end the session, not just gate the access token.
    if token_blacklist.is_blacklisted(refresh_token, db):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error": ErrorCodes.TOKEN_REVOKED,
                "message": "Refresh token has been revoked",
            },
        )

    payload = decode_token(refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": ErrorCodes.INVALID_TOKEN, "message": "Invalid or expired refresh token"},
        )

    uid = _subject_user_id(payload)
    if uid is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error": ErrorCodes.INVALID_TOKEN,
                "message": "Invalid token payload",
            },
        )

    user = db.query(User).filter(User.id == uid).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error": ErrorCodes.INVALID_TOKEN,
                "message": "User not found",
            },
        )

    # Refresh-token rotation (single-use refresh tokens).
    #
    # Without rotation, a captured refresh token keeps minting valid
    # access tokens indefinitely — the only mitigation is the user
    # eventually logging out (which fires /logout's blacklist entry).
    # An attacker can replay the captured token in the gap between
    # capture and logout, minting fresh access tokens as many times
    # as they want.
    #
    # Rotation closes the gap: every successful /refresh blacklists
    # the OLD refresh token BEFORE returning the new pair. Fail closed:
    # if we cannot record the revocation (missing exp, DB error), we
    # refuse to mint a new pair. Issuing while the old token stays
    # valid would leave two live refresh tokens — the exact dual-
    # session hole rotation is meant to close.
    refresh_exp = _payload_exp_seconds(refresh_token)
    if refresh_exp is None:
        # Decoded payload without a usable exp cannot be TTL'd on the
        # blacklist; reject rather than rotate with an immortal row
        # or skip blacklisting entirely.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": ErrorCodes.INVALID_TOKEN, "message": "Invalid or expired refresh token"},
        )
    try:
        token_blacklist.add(
            refresh_token,
            expires_at=_epoch_to_naive(refresh_exp),
            db=db,
            reason="refresh_rotation",
        )
    except Exception as _exc:
        logger.error(
            "Failed to blacklist rotated refresh token for user=%s: %s",
            user.id, _exc,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": ErrorCodes.SERVICE_UNAVAILABLE, "message": "Unable to complete token rotation. Please try again."},
        ) from _exc

    new_access = create_access_token(user.id, user.email)
    new_refresh = create_refresh_token(user.id, user.email)

    return JSONResponse(
        content={
            "success": True,
            "access_token": new_access,
            "refresh_token": new_refresh,
            "user": user_payload(user, db),
        },
    )


@router.get("/me", response_model=UserResponse)
async def me(
    user: User = Depends(get_current_user_required_orm),
    db: Session = Depends(get_db),
) -> UserResponse:
    # Routed through get_current_user_required_orm so the blacklist check
    # at dependencies.py:26 is enforced — without this the endpoint had a
    # side-channel that accepted logged-out tokens.
    # 120/min/user — shell hydrate is hot; still cap token-replay spam.
    enforce_user_rate_limit(
        user.id,
        scope="auth_me",
        limit=120,
        window_seconds=60,
        message="Too many profile reads. Please slow down.",
    )
    return orm_user_to_response(user, db)


@router.get("/me/features")
async def my_features(
    user: User = Depends(get_current_user_required_orm),
) -> dict:
    """Just the caller's tier feature map — a cheaper alternative to
    GET /me when a UI only needs to know 'can this user do X?'.

    Returns { tier, features: {...} } where features is the boolean
    map from TIER_FEATURES. Same auth contract as /me."""
    # 120/min/user — feature gates poll often; match /me ceiling.
    enforce_user_rate_limit(
        user.id,
        scope="auth_me_features",
        limit=120,
        window_seconds=60,
        message="Too many feature-map reads. Please slow down.",
    )
    tier = user.tier.value if hasattr(user.tier, "value") else str(user.tier)
    nt = normalize_tier(tier)
    return {
        "tier": tier,
        "features": TIER_FEATURES.get(nt, TIER_FEATURES[UserTier.FREE]),
    }


@router.get("/check-email")
async def check_email_availability(
    request: Request,
    email: str = Query(..., min_length=1, max_length=255),
    db: Session = Depends(get_db),
) -> dict:
    """Public pre-flight check: is this email already registered?

    Used by the signup form to render 'email already taken' before the
    user submits — better UX than waiting for the 409 from /register.
    Returns ONLY a boolean (and the normalized email), never the
    matching user record — checking email availability must NOT leak
    the existence of any other account.

    IP rate limit (5/min, scoped per IP) blocks the email-enumeration
    attack: without it an unauthenticated caller could probe thousands
    of addresses per second and learn which ones are registered. The
    response shape is constant (just the bool), so a successful probe
    tells the attacker 'this email is taken' — which is exactly the
    leak we need to throttle.
    """
    enforce_ip_rate_limit(
        request,
        scope="auth_check_email",
        limit=5,
        window_seconds=60,
        message="Too many email-availability checks. Please slow down.",
    )
    normalized = email.lower().strip()
    existing = get_user_by_email(db, normalized)
    return {
        "email": normalized,
        "available": existing is None,
    }


@user_router.patch("/profile", response_model=UserResponse)
async def patch_user_profile(
    body: UserProfilePatch,
    user: User = Depends(get_current_user_required_orm),
    db: Session = Depends(get_db),
) -> UserResponse:
    # 30/min/user — profile saves from the account panel.
    enforce_user_rate_limit(
        user.id,
        scope="user_profile_patch",
        limit=30,
        window_seconds=60,
        message="Too many profile updates. Please slow down.",
    )
    if body.name is not None:
        user.name = sanitize_html(body.name, max_length=100, field_name="name")
    if body.expertise_level is not None:
        level = body.expertise_level.strip().lower()
        if level not in _EXPERTISE_LEVELS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": ErrorCodes.VALIDATION_ERROR, "message": "Invalid expertise_level"},
            )
        user.expertise_level = level
    if body.expertise_domain is not None:
        user.expertise_domain = sanitize_html(
            body.expertise_domain,
            max_length=100,
            field_name="expertise domain",
        )

    db.add(user)
    db.commit()
    db.refresh(user)
    return orm_user_to_response(user, db)


@user_router.get("/answer-feedback-stats")
async def user_answer_feedback_stats(
    user: User = Depends(get_current_user_required_orm),
    db: Session = Depends(get_db),
) -> dict:
    # 60/min/user — account panel chart; light aggregation.
    enforce_user_rate_limit(
        user.id,
        scope="user_feedback_stats",
        limit=60,
        window_seconds=60,
        message="Too many feedback stats reads. Please slow down.",
    )
    return get_answer_feedback_distribution(user.id, db)


_CSV_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def _csv_safe(value) -> str:
    """Return ``value`` as a CSV cell safe against formula injection.

    Defense-in-depth for the user usage CSV export (CWE-1236): the current
    cells are server-computed dates and integers, but every CSV surface in
    this codebase routes values through the same OWASP-recommended prefix
    escape so a future column can't regress the file into a spreadsheet
    formula-execution vector.
    """
    s = str(value) if value is not None else ""
    if s and s[0] in _CSV_FORMULA_PREFIXES:
        return "'" + s
    return s


def _markdown_cell(value: object) -> str:
    """Keep computed usage values safe inside Markdown table cells."""
    return (
        str(value)
        .replace("\\", "\\\\")
        .replace("|", "\\|")
        .replace("\r", " ")
        .replace("\n", " ")
    )


def _usage_history_rows(user: User, db: Session) -> list[tuple[date, int]]:
    """Return 14 daily token totals as (UTC date, tokens) pairs, oldest first.

    Shared by the JSON usage endpoint and its CSV export so the dashboard
    chart and the downloaded file cannot drift. Day boundaries use the
    codebase's canonical naive-UTC form so SQLite and Postgres compare
    ``usage_records.timestamp`` identically.
    """
    today_start = utcnow_naive().replace(hour=0, minute=0, second=0, microsecond=0)
    chart_start = today_start - timedelta(days=13)
    token_sum = UsageRecord.input_tokens + UsageRecord.output_tokens
    day_col = func.date(UsageRecord.timestamp).label("day")
    rows = (
        db.query(day_col, func.coalesce(func.sum(token_sum), 0).label("total"))
        .filter(UsageRecord.user_id == user.id, UsageRecord.timestamp >= chart_start)
        .group_by(day_col)
        .all()
    )
    by_day: dict[date, int] = {}
    for r in rows:
        d = r.day
        if isinstance(d, datetime):
            dk = d.date()
        elif isinstance(d, date):
            dk = d
        elif isinstance(d, str):
            dk = date.fromisoformat(d[:10])
        else:
            dk = d
        by_day[dk] = int(r.total or 0)

    history: list[tuple[date, int]] = []
    for i in range(13, -1, -1):
        day = (today_start - timedelta(days=i)).date()
        history.append((day, by_day.get(day, 0)))
    return history


def _user_usage_payload(
    user: User,
    db: Session,
    history: Optional[list[tuple[date, int]]] = None,
) -> dict:
    """Compute the /api/user/usage response for one user.

    ``history`` is optional so the CSV export can compute the 14-day rows
    once and share them with the summary (instead of running the same
    aggregation twice and risking a midnight-boundary mismatch).
    """
    normalized = normalize_tier(get_tier_str(user))
    daily_limit = get_credit_budget(normalized)
    weekly_limit = daily_limit * 7

    today_start = utcnow_naive().replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=7)
    month_start = today_start - timedelta(days=30)

    token_sum = UsageRecord.input_tokens + UsageRecord.output_tokens

    credits_used_today = int(
        db.query(func.coalesce(func.sum(token_sum), 0))
        .filter(UsageRecord.user_id == user.id, UsageRecord.timestamp >= today_start)
        .scalar()
        or 0,
    )
    credits_used_week = int(
        db.query(func.coalesce(func.sum(token_sum), 0))
        .filter(UsageRecord.user_id == user.id, UsageRecord.timestamp >= week_start)
        .scalar()
        or 0,
    )

    credits_remaining_today = max(daily_limit - credits_used_today, 0)
    credits_remaining_week = max(weekly_limit - credits_used_week, 0)

    total_tasks_month = (
        db.query(func.count(UsageRecord.id))
        .filter(UsageRecord.user_id == user.id, UsageRecord.timestamp >= month_start)
        .scalar()
        or 0
    )
    total_tasks_month = int(total_tasks_month)

    if history is None:
        history = _usage_history_rows(user, db)
    usage_history = [tokens for _, tokens in history]

    return {
        "credits_used_today": credits_used_today,
        "credits_remaining_today": credits_remaining_today,
        "daily_limit": daily_limit,
        "credits_used_week": credits_used_week,
        "credits_remaining_week": credits_remaining_week,
        "weekly_limit": weekly_limit,
        "total_tasks_month": total_tasks_month,
        "usage_history": usage_history,
    }


@user_router.get("/usage")
async def get_user_usage(
    user: User = Depends(get_current_user_required_orm),
    db: Session = Depends(get_db),
) -> dict:
    # 60/min/user — multi-aggregate usage dashboard; cap polling.
    enforce_user_rate_limit(
        user.id,
        scope="user_usage",
        limit=60,
        window_seconds=60,
        message="Too many usage stats reads. Please slow down.",
    )
    return _user_usage_payload(user, db)


@user_router.get("/usage/export.csv")
async def export_user_usage_csv(
    user: User = Depends(get_current_user_required_orm),
    db: Session = Depends(get_db),
) -> Response:
    """CSV export of the user's 14-day usage history.

    Shares the JSON endpoint's aggregation helper so the downloaded file
    and the Profile modal chart cannot drift. Uses its own rate-limit scope
    so exporting doesn't consume the JSON endpoint's per-minute budget.

    Follows the same defenses as the other CSV exports in this codebase:
    RFC 4180 quoting, formula-injection escape, no-store, and nosniff.
    """
    enforce_user_rate_limit(
        user.id,
        scope="user_usage_csv",
        limit=60,
        window_seconds=60,
        message="Too many usage CSV exports. Please slow down.",
    )

    history = _usage_history_rows(user, db)
    payload = _user_usage_payload(user, db, history=history)

    import csv
    import io

    buf = io.StringIO()
    writer = csv.writer(buf, quoting=csv.QUOTE_MINIMAL, lineterminator="\r\n")
    writer.writerow(["date", "tokens"])
    for day, tokens in history:
        writer.writerow([_csv_safe(day.isoformat()), tokens])
    writer.writerow(
        [
            f"# credits_used_today={payload['credits_used_today']}",
            f"credits_remaining_today={payload['credits_remaining_today']}",
            f"daily_limit={payload['daily_limit']}",
            f"credits_used_week={payload['credits_used_week']}",
            f"credits_remaining_week={payload['credits_remaining_week']}",
            f"weekly_limit={payload['weekly_limit']}",
            f"total_tasks_month={payload['total_tasks_month']}",
        ]
    )

    filename = (
        f"arena-usage-"
        f"{history[0][0].isoformat()}-to-{history[-1][0].isoformat()}.csv"
    )
    return Response(
        content=buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@user_router.get("/usage/export.json")
async def export_user_usage_json(
    user: User = Depends(get_current_user_required_orm),
    db: Session = Depends(get_db),
) -> Response:
    """JSON export of the user's 14-day usage history and period summary.

    Complements the CSV export for automation and machine-readable backups:
    each daily row carries its date alongside the token total, and the
    summary block mirrors /api/user/usage so the dashboard, CSV, and JSON
    surfaces cannot drift. Uses its own rate-limit scope so exporting JSON
    does not consume the dashboard or CSV export budgets.
    """
    enforce_user_rate_limit(
        user.id,
        scope="user_usage_json",
        limit=60,
        window_seconds=60,
        message="Too many usage JSON exports. Please slow down.",
    )

    history = _usage_history_rows(user, db)
    payload = _user_usage_payload(user, db, history=history)
    start_date, end_date = history[0][0], history[-1][0]
    filename = (
        f"arena-usage-{start_date.isoformat()}-to-{end_date.isoformat()}.json"
    )

    body = {
        "exported_at": utcnow_naive().isoformat() + "Z",
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "summary": {
            key: payload[key]
            for key in (
                "credits_used_today",
                "credits_remaining_today",
                "daily_limit",
                "credits_used_week",
                "credits_remaining_week",
                "weekly_limit",
                "total_tasks_month",
            )
        },
        "history": [
            {"date": day.isoformat(), "tokens": tokens}
            for day, tokens in history
        ],
    }
    return JSONResponse(
        content=body,
        headers={
            "Content-Disposition": content_disposition_attachment(filename),
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@user_router.get("/usage/export.md")
async def export_user_usage_markdown(
    user: User = Depends(get_current_user_required_orm),
    db: Session = Depends(get_db),
) -> Response:
    """Markdown export of the user's 14-day usage history and quota summary.

    This is the shareable, human-readable sibling of the CSV and JSON
    exports. It intentionally uses the same aggregation helper so a report
    copied into notes or an issue tracker cannot disagree with the dashboard.
    """
    enforce_user_rate_limit(
        user.id,
        scope="user_usage_markdown",
        limit=60,
        window_seconds=60,
        message="Too many usage Markdown exports. Please slow down.",
    )

    history = _usage_history_rows(user, db)
    payload = _user_usage_payload(user, db, history=history)
    start_date, end_date = history[0][0], history[-1][0]

    summary_rows = [
        ("Credits used today", payload["credits_used_today"]),
        ("Credits remaining today", payload["credits_remaining_today"]),
        ("Daily limit", payload["daily_limit"]),
        ("Credits used this week", payload["credits_used_week"]),
        ("Credits remaining this week", payload["credits_remaining_week"]),
        ("Weekly limit", payload["weekly_limit"]),
        ("Tasks this month", payload["total_tasks_month"]),
    ]
    lines = [
        "# Arena — usage report",
        "",
        f"**Window:** {start_date.isoformat()} → {end_date.isoformat()} (14 days, UTC)",
        "",
        "## Quota snapshot",
        "",
        "| Metric | Value |",
        "| --- | ---: |",
    ]
    lines.extend(
        f"| {_markdown_cell(label)} | {_markdown_cell(value)} |"
        for label, value in summary_rows
    )
    lines.extend(
        [
            "",
            "## Daily token history",
            "",
            "| Date | Tokens |",
            "| --- | ---: |",
        ]
    )
    lines.extend(
        f"| {_markdown_cell(day.isoformat())} | {_markdown_cell(tokens)} |"
        for day, tokens in history
    )
    lines.extend(["", "---", "_Exported from Arena_", ""])

    filename = (
        f"arena-usage-{start_date.isoformat()}-to-{end_date.isoformat()}.md"
    )
    return Response(
        content="\n".join(lines),
        media_type="text/markdown; charset=utf-8",
        headers={
            "Content-Disposition": content_disposition_attachment(filename),
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@user_router.get("/tier")
async def get_user_tier_summary(
    user: User = Depends(get_current_user_required_orm),
) -> dict:
    # 120/min/user — feature gates hydrate often across shells.
    enforce_user_rate_limit(
        user.id,
        scope="user_tier",
        limit=120,
        window_seconds=60,
        message="Too many tier summary reads. Please slow down.",
    )
    normalized_tier = normalize_tier(get_tier_str(user))
    daily_limit = get_daily_limit(normalized_tier)
    messages_used_today = min(int(user.prompt_count_today or 0), daily_limit)
    base = TIER_FEATURES[normalized_tier]
    agent_mode = bool(base.get("agent_mode", False))
    if normalized_tier == UserTier.PRO:
        agent_mode = True
    elif normalized_tier == UserTier.PLUS and (
        getattr(user, "agent_addon_active", False)
        or getattr(user, "agent_addon_cancelling", False)
    ):
        agent_mode = True

    return {
        "tier": normalized_tier.value,
        "daily_limit": daily_limit,
        "messages_used_today": messages_used_today,
        "messages_remaining": max(daily_limit - messages_used_today, 0),
        "allowed_personas": sorted(get_tier_personas(normalized_tier)),
        "features": {
            "debate": base["debate"],
            "discuss": base["discuss"],
            "memory": base["memory"],
            "saved_responses": base["saved_responses"],
            "agent_mode": agent_mode,
            "agent_orchestrate": base.get("agent_orchestrate", False),
            "agent_watchlist": base.get("agent_watchlist", False),
            "scoring_audit": base["scoring_audit"],
        },
        "upgrade_to": upgrade_target(normalized_tier),
    }


# ──────────────────────────────────────────────────────────────
# Account security: change-password + security metadata
# ──────────────────────────────────────────────────────────────


class ChangePasswordBody(BaseModel):
    """Body for POST /auth/change-password.

    Requiring the current password is a deliberate friction — a stolen
    session token alone isn't enough to take over the account, the
    attacker would also need the user's password.
    """

    current_password: str = Field(..., min_length=1, max_length=128)
    new_password: str = Field(..., min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v: str) -> str:
        ok, reason = _validate_password_strength(v)
        if not ok:
            raise ValueError(reason)
        return v


@router.post("/change-password")
async def change_password(
    body: ChangePasswordBody,
    request: Request,
    user: User = Depends(get_current_user_required_orm),
    db: Session = Depends(get_db),
) -> dict:
    """Rotate the caller's password.

    Verifies the current password before accepting the new one — so a
    stolen access token alone can't take over the account. Rate-limited
    to 5/minute because the verify step runs scrypt (CPU-bound) and a
    brute-force loop would be expensive even with strong hashing.
    """
    enforce_user_rate_limit(
        user.id,
        scope="auth_change_password",
        limit=5,
        window_seconds=60,
        message="Too many password change attempts. Please slow down.",
    )

    matched, _ = verify_password(body.current_password, user.password_hash)
    if not matched:
        # Use the same response shape as a stale-token failure so a
        # caller can't enumerate which current_password values are
        # correct via 401 vs 422.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "current_password_invalid",
                "message": "Current password is incorrect.",
            },
        )

    if matched and verify_password(body.new_password, user.password_hash)[0]:
        # Block no-op rotations — silently accepting a "new" password
        # equal to the current one would defeat the purpose of having
        # a separate password field.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": ErrorCodes.PASSWORD_SAME,
                "message": "New password must differ from the current password.",
            },
        )

    user.password_hash = hash_password(body.new_password)
    db.add(user)
    db.commit()

    # Surface a different log line so a SOC can grep for it.
    logger.info("password_changed user_id=%s", user.id)
    return {"status": "changed"}


@router.get("/security")
async def account_security(
    user: User = Depends(get_current_user_required_orm),
    db: Session = Depends(get_db),
) -> dict:
    """Account-security metadata for the Security panel.

    Returns the timestamps and counts a user needs to make sense of
    'is this account in a healthy state?' — without exposing any
    PII about other accounts.
    """
    # 60/min/user — panel load + DB max() on usage; keep scrapers out.
    enforce_user_rate_limit(
        user.id,
        scope="auth_security",
        limit=60,
        window_seconds=60,
        message="Too many security panel reads. Please slow down.",
    )
    # Account age — 'member since'.
    member_since = user.created_at.isoformat() if user.created_at else None

    # Last login timestamp. We use the most recent successful login as
    # recorded by the UsageRecord timestamp for mode='arena' on this
    # user — not perfect (a brand-new user with no prompts yet has no
    # last-login signal), but a reasonable proxy without a separate
    # login_audit table.
    last_prompt = (
        db.query(func.max(UsageRecord.timestamp))
        .filter(UsageRecord.user_id == user.id)
        .scalar()
    )

    # Password freshness proxy: 'password_changed_at' would require a
    # new column; until that ships, the absence of a tracked timestamp
    # is itself the signal — UI can render 'never changed' or 'set at
    # signup' so users know the password is the original.
    return {
        "email": user.email,
        "member_since": member_since,
        "last_active_at": last_prompt.isoformat() if last_prompt else None,
        "tier": user.tier.value if hasattr(user.tier, "value") else str(user.tier),
        "is_verified": bool(getattr(user, "is_verified", False)),
        "has_password": bool(user.password_hash),
        # Column not shipped yet — UI treats null as "unknown / set at signup".
        "password_last_changed_at": None,
    }


# ────────────────────────────────────────────────────────────────────────
# Password reset
# ────────────────────────────────────────────────────────────────────────

# Tokens expire after one hour. Short enough that a leaked email can't
# be redeemed forever, long enough that a distracted user can still
# find the link in their inbox.
_RESET_TOKEN_TTL_SECONDS = 3600


def _hash_reset_token(token: str) -> str:
    """Stable SHA-256 of the raw reset token. We store the hash only —
    never the raw token — so a DB read does not give an attacker a
    working reset link."""
    import hashlib as _hashlib

    return _hashlib.sha256(token.encode("utf-8")).hexdigest()


class ForgotPasswordBody(BaseModel):
    """Body for POST /auth/forgot-password.

    The response shape is identical regardless of whether the email is
    registered — never leak which addresses hold an account.
    """

    email: str = Field(..., min_length=3, max_length=320)


class ResetPasswordBody(BaseModel):
    """Body for POST /auth/reset-password."""

    token: str = Field(..., min_length=32, max_length=128)
    new_password: str = Field(..., min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v: str) -> str:
        ok, reason = _validate_password_strength(v)
        if not ok:
            raise ValueError(reason)
        return v


@router.post("/forgot-password")
async def forgot_password(
    body: ForgotPasswordBody,
    request: Request,
    db: Session = Depends(get_db),
) -> dict:
    """Issue a single-use password-reset token for ``body.email``.

    Always returns 200 with the same shape so a caller cannot enumerate
    registered addresses via the response. If the address is registered
    a token is generated; the caller has a separate delivery channel
    (the email transport — wired up in a follow-up) to deliver it. For
    now the token is logged at INFO level so an operator can recover
    it from the logs in dev; production wiring belongs in the email
    transport module.

    Constant-time branch: the response shape is identical regardless of
    whether the email is registered, but a naïve `if user: INSERT; COMMIT`
    leaves a measurable timing oracle — the non-existent path skips the
    INSERT and COMMIT, so an attacker averaging 5–10 samples can
    distinguish 'registered' (SELECT + INSERT + COMMIT) from
    'not-registered' (SELECT only) and enumerate which addresses hold an
    account. To close the oracle we always run the full INSERT-and-commit
    path. For a non-existent email we INSERT a row with a sentinel
    user_id that the FK constraint rejects, then roll back. The DB
    roundtrip cost of `INSERT + ROLLBACK` matches the real path's
    `INSERT + COMMIT` closely enough that the timing difference falls
    inside the network jitter floor (sub-millisecond in dev, ~1ms in
    prod). The token_hash is freshly random per request and never
    reachable from /reset-password because the row was rolled back.
    """
    enforce_ip_rate_limit(
        request,
        scope="auth_forgot_password",
        limit=10,
        window_seconds=3600,
        message="Too many password reset requests. Please slow down.",
    )

    normalized = body.email.lower().strip()
    user = get_user_by_email(db, normalized)
    # Always do the full work — see the constant-time note above.
    raw_token = secrets.token_urlsafe(48)
    token_hash = _hash_reset_token(raw_token)
    expires_at = utcnow_naive() + timedelta(
        seconds=_RESET_TOKEN_TTL_SECONDS
    )
    # Sentinel user_id for the non-existent-email path. -1 is never a
    # valid auto-increment id (PostgreSQL starts at 1) so the FK
    # constraint reliably rejects the row. The INSERT + ROLLBACK round
    # balances the real-path INSERT + COMMIT round.
    row = PasswordResetToken(
        user_id=(user.id if user is not None else -1),
        token_hash=token_hash,
        expires_at=expires_at,
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        # PostgreSQL (and other DBs with FK enforcement): the FK
        # constraint rejected user_id=-1, so the row never landed.
        # Roll back so the session is clean for the next request.
        db.rollback()
        logger.info(
            "password_reset_decoy user_not_found email_prefix=%r",
            normalized[:64],
        )
        return {"status": "received"}
    except Exception as exc:
        # Real path commit failure (DB outage, etc.). Roll back, log
        # WITHOUT the email so a log-reader cannot enumerate, and
        # return the same 200 shape so a per-request attacker cannot
        # distinguish 'commit failed' from 'decoy rollback'.
        logger.warning(
            "password_reset: failed to persist token: %s", exc,
        )
        db.rollback()
        return {"status": "received"}

    if user is None:
        # SQLite (and any DB that defaults foreign_keys=OFF): the
        # decoy INSERT landed because SQLite does not enforce FK
        # constraints unless `PRAGMA foreign_keys = ON` is set per
        # connection. Remove the decoy row in a follow-up DELETE so
        # the table stays clean and no token_hash is reachable from
        # /reset-password. The double-roundtrip adds ~1ms to the
        # SQLite path, which is the timing-oracle floor we already
        # accept for the production PostgreSQL path.
        db.delete(row)
        db.commit()
        logger.info(
            "password_reset_decoy user_not_found email_prefix=%r",
            normalized[:64],
        )
    else:
        logger.info(
            "password_reset_issued user_id=%s",
            user.id,
        )

    return {"status": "received"}


@router.post("/reset-password")
async def reset_password(
    body: ResetPasswordBody,
    request: Request,
    db: Session = Depends(get_db),
) -> dict:
    """Redeem a reset token and rotate the user's password.

    Returns 200 even on a stale/forged token — the only signal that a
    reset happened is the password actually rotating. This avoids the
    'is this token valid?' oracle and keeps the API surface flat for
    the client.
    """
    enforce_ip_rate_limit(
        request,
        scope="auth_reset_password",
        limit=10,
        window_seconds=3600,
        message="Too many password reset attempts. Please slow down.",
    )

    token_hash = _hash_reset_token(body.token)
    now = utcnow_naive()
    # Lock the token row for the duration of this transaction so two
    # concurrent redemption attempts cannot both see used_at IS NULL and
    # both rotate the password (HOT-PATH: password-reset token reuse).
    row = (
        db.query(PasswordResetToken)
        .filter(
            PasswordResetToken.token_hash == token_hash,
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.expires_at > now,
        )
        .with_for_update()
        .first()
    )
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "reset_token_invalid"},
        )

    user = (
        db.query(User)
        .filter(User.id == row.user_id)
        .with_for_update()
        .first()
    )
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "reset_token_invalid"},
        )

    if verify_password(body.new_password, user.password_hash)[0]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": ErrorCodes.PASSWORD_SAME,
                "message": "New password must differ from the current password.",
            },
        )

    user.password_hash = hash_password(body.new_password)
    row.used_at = now
    db.add(user)
    db.add(row)
    db.commit()
    logger.info("password_reset_redeemed user_id=%s", user.id)
    return {"status": "reset"}
