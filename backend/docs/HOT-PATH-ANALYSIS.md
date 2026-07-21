# Hot-Path Analysis — Performance Observations

## Auth / User Loading (dependencies.py + cost_tracker.py)
- User model has **20 relationships** with `lazy="selectin"` (18) or `lazy="joined"` (2)
- `get_current_user` fires **18 extra SELECT queries** to eagerly load relationships that are never accessed
- `check_and_increment_user` + `check_token_budget` each re-fetch the User ORM row and trigger the same 18 wasted queries again
- **54 wasted SQL queries per auth-required request** due to unnecessary eager loading

## FOR UPDATE Lock Held Across LLM Work (cost_tracker.py:227)
- `check_token_budget` acquires `with_for_update()` on the User row
- Lock is NOT released until `record_usage()` commits (after all LLM calls finish)
- Same-user requests are **serialized for 10–30 seconds**

## Sequential Per-Agent DB Commits
- Stance archiving does **4 individual `db.commit()`** calls (one per agent) instead of batching
- Drift logging does **4 individual `db.commit()`** calls instead of batching
- Each commit blocks the event loop synchronously

## Lack of Index on Hot Query (cost_tracker.py:31-35)
- `get_today_token_usage` filters on `UsageRecord.user_id` AND `UsageRecord.timestamp >= today_start`
- No composite index on `(user_id, timestamp)` — scans more rows as data grows

## No Caching on Hot Queries
- `get_today_token_usage()` (SUM query) runs on **every request**
- Session summaries for memory (20-row SELECT) fetched fresh every time
- Rate limit counts fetched from DB every request

## Total DB Round-Trips Per Prompt
~24 database round-trips per request (4 SELECTs + 10 INSERT/UPDATEs + 10 commits)

---

# Security Findings (from independent audit)

## CRITICAL
- **Token blacklist race → 500**: Concurrent `logout` calls for same JWT both see `existing is None`, both `db.add()`, second violates unique constraint on `token_hash`. Fix: `db.merge()` or catch `IntegrityError`. (token_blacklist.py:144-168)
- **Multi-worker rate-limit bypass**: All 3 in-memory rate limiters (`InMemoryRateLimiter`, `LoginRateLimiter`, `slowapi.Limiter`) are per-process. With `WEB_CONCURRENCY > 1`, effective limits multiply. (rate_limits.py, login_limiter.py, main.py)

## HIGH
- **Password-reset token reuse**: `reset-password` without `with_for_update()` — two concurrent requests can both see `used_at IS NULL` and both reset to different passwords. (auth.py:996-1053)
- **Email oracle at scale**: `/api/auth/check-email` returns `available: true/false`. IP rate-limited to 5/min. Botnet with rotating IPs can probe unboundedly. (auth.py:551-584)
- **Pro rolling window TOCTOU race**: `check_pro_window_limit` counts without lock — N concurrent requests can all see under-limit and all proceed. (rate_limiter_pro.py:16-49)
- **Webhook returns 200 on failure**: All event handlers catch exceptions and return 200 → Razorpay doesn't retry → silent data loss. (payments.py:958-959)

## MEDIUM
- **Payment.failed webhook dead lookup**: Compares `string` subscription_id to `int` column → ALWAYS returns `None`. Failed payments NEVER downgrade user. (payments.py:943-953)
- **Immediate tier downgrade on cancel**: `subscription.cancelled` webhook sets tier=FREE immediately, even though user paid for current period. (payments.py:835-878)
- **Duplicate scheduler tasks**: `asyncio.create_task` in startup runs on EVERY worker → 4x duplicate live/watchlist/loyalty checks. (main.py:350-353)
- **Guest IP stored in plaintext**: `GuestRateLimit.ip_address`, `DBSession.guest_ip`, `UsageRecord.guest_ip` — PII under GDPR/CCPA, no hashing. (db_models.py:231,180,208)
- **Legacy password truncation at 72 bytes**: Multi-byte UTF-8 split at byte 72 silently drops characters, causing hash collisions. (auth.py:67)
- **Silent bcrypt exception**: `verify_password` catches `Exception` in both paths and silently returns "no match." A corrupted hash = permanent lockout with zero logs. (auth.py:63,79)
- **Webhook unfiltered body size**: `/api/payments/webhook` excluded from `RequestSizeLimitMiddleware` — unbounded body = memory DoS. (request_size.py:48-49)
- **Webhook replay**: No idempotency key on webhook endpoint; same valid payload can be replayed at high frequency. (main.py:110-120)
- **CSP missing `upgrade-insecure-requests`**: Defense-in-depth gap before HSTS is learned on first visit. (main.py:81-91)

---

# Concurrency & Async Findings (from independent audit)

## CRITICAL
- **No `run_in_executor` used anywhere**: Every `db.query()`, `db.commit()`, `.all()` runs synchronously inside async endpoints, blocking the event loop thread on every single DB call. ~78 call sites across `arena/core/`.

## HIGH
- **`ShortTermMemory._store` unprotected**: Module-level dict (`memory.py:174`) shared across all async requests, no `asyncio.Lock`. Compound read-modify-write in `add_turn()` is not thread-safe.
- **`active_tasks` dict unprotected**: Module-level dict (`blackboard.py:236`) — `create_blackboard`, `get_blackboard`, `remove_blackboard` called concurrently with no lock. Race: polling gets `None` during background task completion.
- **`with_for_update()` held 10-30 seconds**: `check_token_budget` (cost_tracker.py:213) acquires row lock, NOT released until `record_usage` (cost_tracker.py:285) commits after all LLM work. Serializes same-user requests.
- **Connection pool exhaustion**: `pool_size=5, max_overflow=10` = max 15 concurrent connections for 5000 users. Each pipeline holds a connection for 10-30s. Under 16+ concurrent requests, 16th blocks for up to `pool_timeout=30`.

## MEDIUM
- **`_session_history` unprotected**: Shared dict in `persona_integrity.py:20` — concurrent `record_response` calls lose updates when cap is reached.
- **TOCTOU in stance archiving**: `save_agent_stance` reads `existing = db.query(...).first()` without `with_for_update()`. Two concurrent inserts for same `(user_id, persona, topic)` can both see `None`, both insert — one violates unique constraint. (stance_archive.py:96-128)
- **`record_usage` rollback not guarded**: `db.rollback()` on line 288 of cost_tracker.py could itself raise (dead connection), propagating an unhandled exception to a 500 on an otherwise successful prompt.
- **`gather(return_exceptions=False)`**: If an agent task is cancelled externally, `CancelledError` (inherits `BaseException`, not `Exception`) propagates through `_call_agent`'s handler and cancels all 4 agents. (orchestrator.py:248)
- **Unbounded `asyncio.Queue`**: No `maxsize` on streaming queue — slow consumer (client) causes unbounded memory growth. (orchestrator.py:403)
- **`run_in_executor` not used**: All sync DB calls in async context — the single biggest concurrency issue, systematic across codebase.

## LOW (but notable)
- `time.sleep()` in database.py build path blocks startup
- Startup scheduler tasks unobserved on DB failure (main.py:350-353)
- `start_periodic_purge()` daemon thread outside FastAPI lifecycle

---

# Database & ORM Findings (from independent audit)

## CRITICAL
- **Alembic migration branch**: Two migrations share `down_revision = "c4f8a1b2d3e4"` → `alembic upgrade head` fails with "Multiple head revisions." Deployment bypasses with raw SQL in `migrate_and_start.py`. (alembic/versions/ — need merge migration)
- **`DBSession.topics` as Text storing JSON**: Should be `JSON` column. No JSONB indexing possible on Postgres; every consumer must `json.loads()` manually. (db_models.py:181)

## HIGH
- **`FeedbackCalibrator` loads all rows**: `get_answer_feedback_distribution` and `get_feedback_calibration` do `AnswerFeedback.query.filter(user_id == ...).all()` — loads every feedback row into Python memory. Power users with 1000s of entries → massive list. Fix: push aggregation to SQL. (feedback_calibrator.py:19,38,83)
- **`Room._room_to_dict` N+1**: For N rooms in a listing, fires 2N extra queries (member count + task count per room). No batching. (rooms.py:48-77)
- **Watchlist N+1**: `list_watchlist_items` loads all items, then calls `_watchlist_item_api_dict` per item, which fires a sub-query per item for `latest_task`. (agent.py:2043-2057)
- **`metadata` column name**: `UXEvent` and `MCPIntegration` use `Column("metadata", JSON)` — `metadata` shadows `Base.metadata`. May confuse alembic autogenerate and tooling. (db_models.py:436,685)

## MEDIUM
- **AgentStance mixed timezones**: `stance_archive.py` uses tz-aware `datetime.now(UTC)` while rest of codebase uses tz-naive `utcnow_naive()`. Same column stores both. (stance_archive.py:44)
- **`refresh_token_hash` column type mismatch**: Model says `VARCHAR(255)`, migration says `VARCHAR` (unbounded). Different between dev/prod. (db_models.py:53 vs migrate_and_start.py:42)
- **Subscription lookup duplicated 3x**: Same `subscription_id`/`user_id` fallback query repeated in payments.py, entitlements.py. (payments.py:973-981, entitlements.py:63-73)
- **`migrate_and_start.py` creates dead column**: `agent_addon_subscription_id` created, backfilled to `addon_subscription_id`, then never updated — stale dead storage.
- **`DBSession.topics` no server_default**: `default="[]"` applies only at ORM layer. Raw INSERTs get NULL → `json.loads(None)` crashes. (db_models.py:181)
- **Watchlist latest_task sub-query per item**: `_watchlist_item_api_dict` runs a separate `db.query(...).first()` per watchlist item. (agent.py)
- **Old `agent_addon_subscription_id` column**: Created, backfilled to `addon_subscription_id`, never updated again — dead storage.

## LOW
- `User.name` length: model `String` (unbounded) vs migration `String(255)` — minor inconsistency
- `PasswordResetToken.token_hash`: `unique=True` (index) in model vs `UNIQUE NOT NULL` (constraint) in migration
- `ScoringAudit.winner_agent_id nullable=False` but could be empty string in practice
- `Orchestration.user_id` and `AgentTask.user_id` missing `ondelete` cascade → orphaned rows on user delete
- GuestRateLimit uses `ip_address` while UsageRecord/DBSession use `guest_ip` — inconsistent naming
- `_now()` lazy import per call in db_models.py — intentional to avoid circular import

---

# API & Error Handling Findings (from independent audit)

## CRITICAL
- **ErrorResponse schema mismatch**: `ErrorResponse` defines `{"error": ..., "detail": ...}` but every runtime error uses `{"error": ..., "message": ...}`. OpenAPI docs are wrong; auto-generated clients will parse for the wrong key. (schemas.py:237-242)

## HIGH
- **Bare string error in prompt rejection**: `detail=pipeline_result.rejection_reason` is a raw string, not `{"error": ..., "message": ...}`. FastAPI serializes as `{"detail": "..."}` — wrong shape. (prompt.py:180-183)
- **Side effect on GET**: `rooms.py:527-531` does `room.last_seen_at = now; db.commit()` in a GET endpoint — violates HTTP idempotency. Should be POST.
- **Manual `request.json()` parsing**: `auth.py:343-348` (logout) and `auth.py:397-401` (refresh) parse body manually without a Pydantic model. Malformed JSON silently ignored (`except Exception: pass`).
- **Missing `"message"` in auth errors**: `auth.py:826` returns bare `{"error": "current_password_invalid"}` and `auth.py:835` returns `{"error": "new_password_must_differ"}` — missing required `"message"` field.
- **LLM error details leaked to client**: `debate.py:154-160` returns `f"[Failed to react: {e}]"` — `str(e)` from the LLM provider contains model names, token counts, internal infrastructure details.

## MEDIUM
- **RateLimitError schema mismatch**: Schema has `resets_at` field but runtime doesn't return it; runtime returns `scope` but schema doesn't define it. (schemas.py:367-373)
- **Inline error strings instead of ErrorCodes**: At least 7 error strings (`current_password_invalid`, `new_password_must_differ`, `reset_token_invalid`, `preset_not_found`, `persona_not_found`, `unsupported_service`, `not_rated`) not in ErrorCodes enum.
- **File upload buffers entire file**: `agent.py:972-974` does `await file.read()` before checking size. 2GB file = 2GB memory spike.
- **Webhook race — no locking**: Multiple simultaneous `subscription.charged` webhooks can double-count payments. (payments.py)
- **Unbounded room payload**: `_build_room_payload` returns all members + all tasks with no pagination. (rooms.py)
- **Unused ErrorCodes**: `PASSWORD_SAME`, `UPGRADE_REQUIRED` defined but never used.
- **200 instead of 201/202**: Creation endpoints return 200 (discuss threads, saved, calibration, rooms, panels). Background tasks return 200 instead of 202 (agent.py).

## LOW
- Missing `max_length` on `AddTaskBody.task_id` path param
- Missing query param bounds in `GET /history` and `GET /watchlist`
- Persona tier leak: anonymous callers can pass `?tier=pro` to learn paywalled persona IDs
- Slug uniqueness race in room creation
- Panel validation race on tier downgrade
- Analytics silent error swallow (intentional but should warn-level log)
- SSE cleanup completeness across generators

---

# Code Quality Findings (from static audit)

## CRITICAL
- **`except Exception: pass` in password verification**: Two bare pass blocks in `verify_password()` (`auth.py:63,79`). A corrupted bcrypt hash causes permanent lockout with zero diagnostic output.
- **F-string in logger.error**: `f"Failed to record usage: {e}"` (`cost_tracker.py:287`) — loses `exc_info`, formats even if log level suppresses it. ~10 more instances across the codebase.

## HIGH — Silent exception swallows (14 sites total)
- **scorer.py:165-166**: `except Exception: pass` — scoring audit failure silently dropped
- **persona_integrity.py:161-162**: Drift log persistence failure silently dropped
- **analytics.py:114-115**: UX event tracking failure silently dropped
- **synthesizer.py:215-216**: `model_used` assignment failure silently dropped
- **intelligence_scorer.py:105-106**: JSON parse failure silently dropped
- **assumption_surfacer.py:71-72**: JSON parse failure silently dropped
- **contradiction_detector.py:100-102**: JSON parse failure silently dropped
- **temporal_evolution.py:80-81**: JSON parse failure silently dropped
- **rooms.py:124-125,823-824,1030-1031,1046-1047**: 4x silent passes
- **agent.py:838-839**: JSON parse of `final_answer` silently fails
- **debate.py:445-446**: LLM JSON parse silently returns raw string
- **observability.py:315-316**: `_read_rss_bytes` import psutil failure silently passed
- **llm_retry.py:119-120**: `on_retry` callback failure silently swallowed

## HIGH — Overly broad except clauses (8 sites)
- **database.py:122**: `_make_retrying_pg_creator` — catches `Exception` broadly
- **database.py:314-315,324-325**: `get_db` middleware — catches `Exception` broadly
- **config.py:318**: `Fernet()` init — catches `Exception` instead of `InvalidToken`
- **loyalty_scheduler.py:93,113,126**: 3x broad catches around DB ops
- **input_pipeline.py:186,211,237**: 3x `except Exception: return fallback` with no logging
- **discuss.py:212-216**, **debate.py:268-272**: Broad catch, re-raises as 500, loses context
- **agent_pipeline.py:231,241,252,262**: 4 safe-* closures return `{}` silently on failure
- **web_search.py**: Broad catch with no logging

## MEDIUM
- Mutable default: module-level `_DEBOUNCE_MEMO` dict in `dependencies.py`
- Type safety: `-> Any` return types instead of concrete types in database.py, report_generator.py, blackboard.py
- `Optional[X]` used instead of `X | None` throughout (~85+ sites, Python 3.11 target)
- Magic numbers: `200` in response_shaper.py, `MAX_IMAGE_PIXELS` hardcoded in file_ingest.py, `pool_recycle=280` hardcoded in database.py
- Dead code: `_ = user_tier` unused assignment in cost_tracker.py:187
- Missing `__all__` in `arena/core/stages/__init__.py`
- `print()` in comments: config.py lines 130,238,247,311
- Process-local blackboard state documented but fragile (multi-worker loses tasks)

## LOW
- Inconsistent naming: `ip_address` vs `guest_ip` for same concept
- File ingest uses `Image.open()` without context manager
- `_read_rss_bytes` vs `_read_open_fd_count` inconsistent structure
