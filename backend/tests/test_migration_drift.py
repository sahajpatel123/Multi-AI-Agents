"""CI guard: every Column / __tablename__ in db_models.py must have a
matching entry in migrate_and_start.py.

Three consecutive cycles (9, 10, 11) shipped a feat that added a
column or table to db_models.py but forgot to add the matching
``ALTER TABLE ADD COLUMN IF NOT EXISTS`` / ``CREATE TABLE IF NOT
EXISTS`` to migrate_and_start.py. The migration list is enforced
manually, which is exactly the kind of rule humans forget. This test
parses the schema and the migration file, asserts coverage, and
fails the build if a future commit drifts.

If you legitimately need to ship a column WITHOUT a migration
(e.g. dev-only feature flag), update the ``_ALLOWLISTED_OMISSIONS``
constant below with a justification comment.

This test does not require a DB / app boot — it parses Python source
directly via ast so it runs in a few milliseconds.
"""

from __future__ import annotations

import ast
import re
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
DB_MODELS = REPO_ROOT / "arena" / "db_models.py"
MIGRATIONS = REPO_ROOT / "migrate_and_start.py"


# Columns and tables that are intentionally NOT in migrate_and_start.py.
# Each entry is (table_name, column_or_None, reason).
# If you add an entry, write a one-line justification — future maintainers
# need to know why the migration is missing so they don't accidentally
# re-add it.
_ALLOWLISTED_OMISSIONS: set[tuple[str, str | None, str]] = {
# Initial-schema baseline. Auto-generated from db_models.py at
# the time this CI guard was added. Every column currently on
# the model is here; any column added in a future commit must
# ALSO be paired with an ALTER TABLE ADD COLUMN IF NOT EXISTS
# entry in migrate_and_start.py, or this test will fail.
# See docstring above for the full rationale.
    ("agent_contradictions", "id", "initial schema at guard-add time"),
    ("agent_contradictions", "user_id", "initial schema at guard-add time"),
    ("agent_contradictions", "new_task_id", "initial schema at guard-add time"),
    ("agent_contradictions", "old_task_id", "initial schema at guard-add time"),
    ("agent_contradictions", "contradiction_summary", "initial schema at guard-add time"),
    ("agent_contradictions", "severity", "initial schema at guard-add time"),
    ("agent_contradictions", "resolved", "initial schema at guard-add time"),
    ("agent_contradictions", "created_at", "initial schema at guard-add time"),
    ("agent_stances", "id", "initial schema at guard-add time"),
    ("agent_stances", "user_id", "initial schema at guard-add time"),
    ("agent_stances", "persona_id", "initial schema at guard-add time"),
    ("agent_stances", "topic", "initial schema at guard-add time"),
    ("agent_stances", "topic_normalized", "initial schema at guard-add time"),
    ("agent_stances", "stance", "initial schema at guard-add time"),
    ("agent_stances", "confidence", "initial schema at guard-add time"),
    ("agent_stances", "session_id", "initial schema at guard-add time"),
    ("agent_stances", "prompt_snippet", "initial schema at guard-add time"),
    ("agent_stances", "created_at", "initial schema at guard-add time"),
    ("agent_stances", "updated_at", "initial schema at guard-add time"),
    ("agent_tasks", "id", "initial schema at guard-add time"),
    ("agent_tasks", "user_id", "initial schema at guard-add time"),
    ("agent_tasks", "orchestration_id", "initial schema at guard-add time"),
    ("agent_tasks", "watchlist_item_id", "initial schema at guard-add time"),
    ("agent_tasks", "task_id", "initial schema at guard-add time"),
    ("agent_tasks", "title", "initial schema at guard-add time"),
    ("agent_tasks", "task_text", "initial schema at guard-add time"),
    ("agent_tasks", "final_answer", "initial schema at guard-add time"),
    ("agent_tasks", "final_score", "initial schema at guard-add time"),
    ("agent_tasks", "final_confidence", "initial schema at guard-add time"),
    ("agent_tasks", "sources_used", "initial schema at guard-add time"),
    ("agent_tasks", "topics", "initial schema at guard-add time"),
    ("agent_tasks", "key_conclusions", "initial schema at guard-add time"),
    ("agent_tasks", "stages_run", "initial schema at guard-add time"),
    ("agent_tasks", "user_feedback", "initial schema at guard-add time"),
    ("agent_tasks", "feedback_note", "initial schema at guard-add time"),
    ("agent_tasks", "insight_report", "initial schema at guard-add time"),
    ("agent_tasks", "contradictions", "initial schema at guard-add time"),
    ("agent_tasks", "intelligence_score", "initial schema at guard-add time"),
    ("agent_tasks", "is_live", "initial schema at guard-add time"),
    ("agent_tasks", "live_last_checked", "initial schema at guard-add time"),
    ("agent_tasks", "live_next_check", "initial schema at guard-add time"),
    # live_reschedule_hours NOT in baseline — added in 18d3eee, must be covered by ALTER TABLE
    ("agent_tasks", "live_updates", "initial schema at guard-add time"),
    ("agent_tasks", "created_at", "initial schema at guard-add time"),
    ("answer_feedback", "id", "initial schema at guard-add time"),
    ("answer_feedback", "user_id", "initial schema at guard-add time"),
    ("answer_feedback", "task_id", "initial schema at guard-add time"),
    ("answer_feedback", "verdict", "initial schema at guard-add time"),
    ("answer_feedback", "note", "initial schema at guard-add time"),
    ("answer_feedback", "created_at", "initial schema at guard-add time"),
    ("confidence_ratings", "id", "initial schema at guard-add time"),
    ("confidence_ratings", "user_id", "initial schema at guard-add time"),
    ("confidence_ratings", "task_id", "initial schema at guard-add time"),
    ("confidence_ratings", "user_rating", "initial schema at guard-add time"),
    ("confidence_ratings", "system_score", "initial schema at guard-add time"),
    ("confidence_ratings", "delta", "initial schema at guard-add time"),
    ("confidence_ratings", "created_at", "initial schema at guard-add time"),
    ("discuss_threads", "id", "initial schema at guard-add time"),
    ("discuss_threads", "user_id", "initial schema at guard-add time"),
    ("discuss_threads", "agent_id", "initial schema at guard-add time"),
    ("discuss_threads", "title", "initial schema at guard-add time"),
    ("discuss_threads", "messages", "initial schema at guard-add time"),
    ("discuss_threads", "original_prompt", "initial schema at guard-add time"),
    ("discuss_threads", "original_verdict", "initial schema at guard-add time"),
    ("discuss_threads", "last_message_at", "initial schema at guard-add time"),
    ("discuss_threads", "created_at", "initial schema at guard-add time"),
    ("guest_rate_limits", "id", "initial schema at guard-add time"),
    ("guest_rate_limits", "ip_address", "initial schema at guard-add time"),
    ("guest_rate_limits", "prompt_count_today", "initial schema at guard-add time"),
    ("guest_rate_limits", "reset_at", "initial schema at guard-add time"),
    ("handoff_drafts", "id", "initial schema at guard-add time"),
    ("handoff_drafts", "user_id", "initial schema at guard-add time"),
    ("handoff_drafts", "capability", "initial schema at guard-add time"),
    ("handoff_drafts", "payload_json", "initial schema at guard-add time"),
    ("handoff_drafts", "created_at", "initial schema at guard-add time"),
    ("handoff_events", "id", "initial schema at guard-add time"),
    ("handoff_events", "handoff_id", "initial schema at guard-add time"),
    ("handoff_events", "event_id", "initial schema at guard-add time"),
    ("handoff_events", "event_kind", "initial schema at guard-add time"),
    ("handoff_events", "payload", "initial schema at guard-add time"),
    ("handoff_events", "created_at", "initial schema at guard-add time"),
    ("handoff_records", "id", "initial schema at guard-add time"),
    ("handoff_records", "user_id", "initial schema at guard-add time"),
    ("handoff_records", "session_id", "initial schema at guard-add time"),
    ("handoff_records", "capability", "initial schema at guard-add time"),
    ("handoff_records", "execution_env", "initial schema at guard-add time"),
    ("handoff_records", "condura_run_id", "initial schema at guard-add time"),
    ("handoff_records", "status", "initial schema at guard-add time"),
    ("handoff_records", "retention_class", "initial schema at guard-add time"),
    ("handoff_records", "summary", "initial schema at guard-add time"),
    ("handoff_records", "created_at", "initial schema at guard-add time"),
    ("handoff_records", "updated_at", "initial schema at guard-add time"),
    ("mcp_integrations", "id", "initial schema at guard-add time"),
    ("mcp_integrations", "user_id", "initial schema at guard-add time"),
    ("mcp_integrations", "service", "initial schema at guard-add time"),
    ("mcp_integrations", "display_name", "initial schema at guard-add time"),
    ("mcp_integrations", "access_token", "initial schema at guard-add time"),
    ("mcp_integrations", "refresh_token", "initial schema at guard-add time"),
    ("mcp_integrations", "token_expires_at", "initial schema at guard-add time"),
    ("mcp_integrations", "is_active", "initial schema at guard-add time"),
    ("mcp_integrations", "connected_at", "initial schema at guard-add time"),
    ("mcp_integrations", "integration_metadata", "initial schema at guard-add time"),
    ("migration_flags", "id", "initial schema at guard-add time"),
    ("migration_flags", "user_id", "initial schema at guard-add time"),
    ("migration_flags", "kind", "initial schema at guard-add time"),
    ("migration_flags", "ref_id", "initial schema at guard-add time"),
    ("migration_flags", "affected_capability", "initial schema at guard-add time"),
    ("migration_flags", "surfaced_at", "initial schema at guard-add time"),
    ("migration_flags", "resolved_at", "initial schema at guard-add time"),
    ("migration_flags", "user_decision", "initial schema at guard-add time"),
    ("orchestrations", "id", "initial schema at guard-add time"),
    ("orchestrations", "user_id", "initial schema at guard-add time"),
    ("orchestrations", "task_ids", "initial schema at guard-add time"),
    ("orchestrations", "synthesis", "initial schema at guard-add time"),
    ("orchestrations", "synthesis_bullets", "initial schema at guard-add time"),
    ("orchestrations", "conflicts", "initial schema at guard-add time"),
    ("orchestrations", "status", "initial schema at guard-add time"),
    ("orchestrations", "created_at", "initial schema at guard-add time"),
    ("password_reset_tokens", "id", "initial schema at guard-add time"),
    ("password_reset_tokens", "user_id", "initial schema at guard-add time"),
    ("password_reset_tokens", "token_hash", "initial schema at guard-add time"),
    ("password_reset_tokens", "created_at", "initial schema at guard-add time"),
    ("password_reset_tokens", "expires_at", "initial schema at guard-add time"),
    ("password_reset_tokens", "used_at", "initial schema at guard-add time"),
    ("persona_drift_logs", "id", "initial schema at guard-add time"),
    ("persona_drift_logs", "session_id", "initial schema at guard-add time"),
    ("persona_drift_logs", "user_id", "initial schema at guard-add time"),
    ("persona_drift_logs", "persona_id", "initial schema at guard-add time"),
    ("persona_drift_logs", "agent_id", "initial schema at guard-add time"),
    ("persona_drift_logs", "prompt_snippet", "initial schema at guard-add time"),
    ("persona_drift_logs", "drift_detected", "initial schema at guard-add time"),
    ("persona_drift_logs", "overlap_detected", "initial schema at guard-add time"),
    ("persona_drift_logs", "overlap_score", "initial schema at guard-add time"),
    ("persona_drift_logs", "reprompt_triggered", "initial schema at guard-add time"),
    ("persona_drift_logs", "reprompt_success", "initial schema at guard-add time"),
    ("persona_drift_logs", "original_response_snippet", "initial schema at guard-add time"),
    ("persona_drift_logs", "final_response_snippet", "initial schema at guard-add time"),
    ("persona_drift_logs", "created_at", "initial schema at guard-add time"),
    ("persona_library", "id", "initial schema at guard-add time"),
    ("persona_library", "persona_id", "initial schema at guard-add time"),
    ("persona_library", "name", "initial schema at guard-add time"),
    ("persona_library", "color", "initial schema at guard-add time"),
    ("persona_library", "bg_tint", "initial schema at guard-add time"),
    ("persona_library", "quote", "initial schema at guard-add time"),
    ("persona_library", "description", "initial schema at guard-add time"),
    ("persona_library", "temperature", "initial schema at guard-add time"),
    ("persona_library", "system_prompt", "initial schema at guard-add time"),
    ("persona_library", "provider", "initial schema at guard-add time"),
    ("persona_library", "is_locked", "initial schema at guard-add time"),
    ("persona_library", "display_order", "initial schema at guard-add time"),
    ("persona_library", "created_at", "initial schema at guard-add time"),
    ("revoked_tokens", "id", "initial schema at guard-add time"),
    ("revoked_tokens", "token_hash", "initial schema at guard-add time"),
    ("revoked_tokens", "expires_at", "initial schema at guard-add time"),
    ("revoked_tokens", "revoked_at", "initial schema at guard-add time"),
    ("revoked_tokens", "reason", "initial schema at guard-add time"),
    ("room_members", "id", "initial schema at guard-add time"),
    ("room_members", "room_id", "initial schema at guard-add time"),
    ("room_members", "user_id", "initial schema at guard-add time"),
    ("room_members", "joined_at", "initial schema at guard-add time"),
    ("room_members", "last_seen_at", "initial schema at guard-add time"),
    ("room_tasks", "id", "initial schema at guard-add time"),
    ("room_tasks", "room_id", "initial schema at guard-add time"),
    ("room_tasks", "task_id", "initial schema at guard-add time"),
    ("room_tasks", "user_id", "initial schema at guard-add time"),
    ("room_tasks", "added_at", "initial schema at guard-add time"),
    ("rooms", "id", "initial schema at guard-add time"),
    ("rooms", "name", "initial schema at guard-add time"),
    ("rooms", "slug", "initial schema at guard-add time"),
    ("rooms", "creator_id", "initial schema at guard-add time"),
    ("rooms", "synthesis", "initial schema at guard-add time"),
    ("rooms", "synthesis_updated_at", "initial schema at guard-add time"),
    ("rooms", "is_active", "initial schema at guard-add time"),
    ("rooms", "created_at", "initial schema at guard-add time"),
    ("saved_responses", "id", "initial schema at guard-add time"),
    ("saved_responses", "user_id", "initial schema at guard-add time"),
    ("saved_responses", "session_id", "initial schema at guard-add time"),
    ("saved_responses", "agent_id", "initial schema at guard-add time"),
    ("saved_responses", "persona_id", "initial schema at guard-add time"),
    ("saved_responses", "persona_name", "initial schema at guard-add time"),
    ("saved_responses", "persona_color", "initial schema at guard-add time"),
    ("saved_responses", "prompt", "initial schema at guard-add time"),
    ("saved_responses", "one_liner", "initial schema at guard-add time"),
    ("saved_responses", "verdict", "initial schema at guard-add time"),
    ("saved_responses", "score", "initial schema at guard-add time"),
    ("saved_responses", "confidence", "initial schema at guard-add time"),
    ("saved_responses", "saved_at", "initial schema at guard-add time"),
    ("scoring_audits", "id", "initial schema at guard-add time"),
    ("scoring_audits", "session_id", "initial schema at guard-add time"),
    ("scoring_audits", "user_id", "initial schema at guard-add time"),
    ("scoring_audits", "prompt_snippet", "initial schema at guard-add time"),
    ("scoring_audits", "prompt_category", "initial schema at guard-add time"),
    ("scoring_audits", "winner_agent_id", "initial schema at guard-add time"),
    ("scoring_audits", "winner_persona_id", "initial schema at guard-add time"),
    ("scoring_audits", "winner_score", "initial schema at guard-add time"),
    ("scoring_audits", "scores", "initial schema at guard-add time"),
    ("scoring_audits", "criteria_breakdown", "initial schema at guard-add time"),
    ("scoring_audits", "confidence_values", "initial schema at guard-add time"),
    ("scoring_audits", "persona_ids_used", "initial schema at guard-add time"),
    ("scoring_audits", "scoring_duration_ms", "initial schema at guard-add time"),
    ("scoring_audits", "fallback_used", "initial schema at guard-add time"),
    ("scoring_audits", "created_at", "initial schema at guard-add time"),
    ("session_summaries", "id", "initial schema at guard-add time"),
    ("session_summaries", "session_id", "initial schema at guard-add time"),
    ("session_summaries", "user_id", "initial schema at guard-add time"),
    ("session_summaries", "main_topics", "initial schema at guard-add time"),
    ("session_summaries", "dominant_category", "initial schema at guard-add time"),
    ("session_summaries", "preferred_depth", "initial schema at guard-add time"),
    ("session_summaries", "trusted_persona", "initial schema at guard-add time"),
    ("session_summaries", "key_positions_taken", "initial schema at guard-add time"),
    ("session_summaries", "session_summary", "initial schema at guard-add time"),
    ("session_summaries", "exchange_count", "initial schema at guard-add time"),
    ("session_summaries", "raw_exchanges_count", "initial schema at guard-add time"),
    ("session_summaries", "compressed_at", "initial schema at guard-add time"),
    ("session_summaries", "created_at", "initial schema at guard-add time"),
    ("sessions", "id", "initial schema at guard-add time"),
    ("sessions", "session_id", "initial schema at guard-add time"),
    ("sessions", "user_id", "initial schema at guard-add time"),
    ("sessions", "guest_ip", "initial schema at guard-add time"),
    ("sessions", "topics", "initial schema at guard-add time"),
    ("sessions", "created_at", "initial schema at guard-add time"),
    ("sessions", "last_active", "initial schema at guard-add time"),
    ("subscriptions", "id", "initial schema at guard-add time"),
    ("subscriptions", "user_id", "initial schema at guard-add time"),
    ("subscriptions", "razorpay_subscription_id", "initial schema at guard-add time"),
    ("subscriptions", "razorpay_customer_id", "initial schema at guard-add time"),
    ("subscriptions", "plan_id", "initial schema at guard-add time"),
    ("subscriptions", "plan_name", "initial schema at guard-add time"),
    ("subscriptions", "tier", "initial schema at guard-add time"),
    ("subscriptions", "billing_period", "initial schema at guard-add time"),
    ("subscriptions", "status", "initial schema at guard-add time"),
    ("subscriptions", "current_start", "initial schema at guard-add time"),
    ("subscriptions", "current_end", "initial schema at guard-add time"),
    ("subscriptions", "amount", "initial schema at guard-add time"),
    ("subscriptions", "currency", "initial schema at guard-add time"),
    ("subscriptions", "payment_count", "initial schema at guard-add time"),
    ("subscriptions", "created_at", "initial schema at guard-add time"),
    ("subscriptions", "updated_at", "initial schema at guard-add time"),
    ("turns", "id", "initial schema at guard-add time"),
    ("turns", "turn_id", "initial schema at guard-add time"),
    ("turns", "session_id", "initial schema at guard-add time"),
    ("turns", "prompt", "initial schema at guard-add time"),
    ("turns", "agent_responses", "initial schema at guard-add time"),
    ("turns", "winner_id", "initial schema at guard-add time"),
    ("turns", "timestamp", "initial schema at guard-add time"),
    ("usage_records", "id", "initial schema at guard-add time"),
    ("usage_records", "user_id", "initial schema at guard-add time"),
    ("usage_records", "guest_ip", "initial schema at guard-add time"),
    ("usage_records", "session_id", "initial schema at guard-add time"),
    ("usage_records", "request_id", "initial schema at guard-add time"),
    ("usage_records", "input_tokens", "initial schema at guard-add time"),
    ("usage_records", "output_tokens", "initial schema at guard-add time"),
    ("usage_records", "estimated_cost_usd", "initial schema at guard-add time"),
    ("usage_records", "prompt_category", "initial schema at guard-add time"),
    ("usage_records", "winner_agent_id", "initial schema at guard-add time"),
    ("usage_records", "persona_ids", "initial schema at guard-add time"),
    ("usage_records", "panel_used", "initial schema at guard-add time"),
    ("usage_records", "mode", "initial schema at guard-add time"),
    ("usage_records", "winning_persona_id", "initial schema at guard-add time"),
    ("usage_records", "total_processing_ms", "initial schema at guard-add time"),
    ("usage_records", "timestamp", "initial schema at guard-add time"),
    ("user_panels", "id", "initial schema at guard-add time"),
    ("user_panels", "user_id", "initial schema at guard-add time"),
    ("user_panels", "slot_1", "initial schema at guard-add time"),
    ("user_panels", "slot_2", "initial schema at guard-add time"),
    ("user_panels", "slot_3", "initial schema at guard-add time"),
    ("user_panels", "slot_4", "initial schema at guard-add time"),
    ("user_panels", "updated_at", "initial schema at guard-add time"),
    ("user_preferences", "id", "initial schema at guard-add time"),
    ("user_preferences", "user_id", "initial schema at guard-add time"),
    ("user_preferences", "preferred_depth", "initial schema at guard-add time"),
    ("user_preferences", "trusted_persona_id", "initial schema at guard-add time"),
    ("user_preferences", "topic_interests", "initial schema at guard-add time"),
    ("user_preferences", "total_prompts", "initial schema at guard-add time"),
    ("user_preferences", "total_debates", "initial schema at guard-add time"),
    ("user_preferences", "total_discusses", "initial schema at guard-add time"),
    ("user_preferences", "most_used_panel", "initial schema at guard-add time"),
    ("user_preferences", "created_at", "initial schema at guard-add time"),
    ("user_preferences", "updated_at", "initial schema at guard-add time"),
    ("users", "id", "initial schema at guard-add time"),
    ("users", "email", "initial schema at guard-add time"),
    ("users", "name", "initial schema at guard-add time"),
    ("users", "expertise_level", "initial schema at guard-add time"),
    ("users", "expertise_domain", "initial schema at guard-add time"),
    ("users", "password_hash", "initial schema at guard-add time"),
    ("users", "refresh_token_hash", "initial schema at guard-add time"),
    ("users", "refresh_token_expires_at", "initial schema at guard-add time"),
    ("users", "tier", "initial schema at guard-add time"),
    ("users", "created_at", "initial schema at guard-add time"),
    ("users", "last_active", "initial schema at guard-add time"),
    ("users", "prompt_count_today", "initial schema at guard-add time"),
    ("users", "prompt_count_reset_at", "initial schema at guard-add time"),
    ("users", "razorpay_customer_id", "initial schema at guard-add time"),
    ("users", "subscription_id", "initial schema at guard-add time"),
    ("users", "subscription_status", "initial schema at guard-add time"),
    ("users", "subscription_end_date", "initial schema at guard-add time"),
    ("users", "consecutive_payments", "initial schema at guard-add time"),
    ("users", "loyalty_reward_active", "initial schema at guard-add time"),
    ("users", "loyalty_free_months_remaining", "initial schema at guard-add time"),
    ("users", "loyalty_resume_at", "initial schema at guard-add time"),
    ("users", "loyalty_resume_attempts", "initial schema at guard-add time"),
    ("users", "loyalty_resume_next_attempt_at", "initial schema at guard-add time"),
    ("users", "agent_addon_active", "initial schema at guard-add time"),
    ("users", "agent_addon_cancelling", "initial schema at guard-add time"),
    ("users", "addon_subscription_id", "initial schema at guard-add time"),
    ("ux_events", "id", "initial schema at guard-add time"),
    ("ux_events", "user_id", "initial schema at guard-add time"),
    ("ux_events", "session_id", "initial schema at guard-add time"),
    ("ux_events", "event_type", "initial schema at guard-add time"),
    ("ux_events", "persona_id", "initial schema at guard-add time"),
    ("ux_events", "agent_id", "initial schema at guard-add time"),
    ("ux_events", "event_metadata", "initial schema at guard-add time"),
    ("ux_events", "created_at", "initial schema at guard-add time"),
    ("watchlist_items", "id", "initial schema at guard-add time"),
    ("watchlist_items", "user_id", "initial schema at guard-add time"),
    ("watchlist_items", "question", "initial schema at guard-add time"),
    ("watchlist_items", "interval_hours", "initial schema at guard-add time"),
    ("watchlist_items", "expertise_level", "initial schema at guard-add time"),
    ("watchlist_items", "expertise_domain", "initial schema at guard-add time"),
    ("watchlist_items", "last_run_at", "initial schema at guard-add time"),
    ("watchlist_items", "next_run_at", "initial schema at guard-add time"),
    ("watchlist_items", "latest_task_id", "initial schema at guard-add time"),
    ("watchlist_items", "run_count", "initial schema at guard-add time"),
    ("watchlist_items", "is_active", "initial schema at guard-add time"),
    ("watchlist_items", "created_at", "initial schema at guard-add time"),
}


def _parse_db_models() -> tuple[dict[str, list[tuple[str, str]]], set[str]]:
    """Return ({table_name: [(column_name, type_str), ...]}, set of table_names).

    type_str is a human-readable representation of the SQLAlchemy Column
    type ("Integer", "String(64)", "Boolean", "DateTime", "JSON"/"JSONB",
    "TIMESTAMP", etc.) — close enough for substring matching against the
    migration's ALTER TABLE statements.

    Handles both `col = Column(...)` and `col: int = Column(...)` AST shapes
    because db_models.py uses both conventions.
    """
    tree = ast.parse(DB_MODELS.read_text())
    tables: dict[str, list[tuple[str, str]]] = {}
    for node in ast.walk(tree):
        if not isinstance(node, ast.ClassDef):
            continue
        tablename: str | None = None
        columns: list[tuple[str, str]] = []
        for item in node.body:
            # Capture __tablename__ from the simple Assign form
            # (`__tablename__ = "users"`).
            if isinstance(item, ast.Assign) and len(item.targets) == 1:
                target = item.targets[0]
                if (
                    isinstance(target, ast.Name)
                    and target.id == "__tablename__"
                    and isinstance(item.value, ast.Constant)
                    and isinstance(item.value.value, str)
                ):
                    tablename = item.value.value

            # Capture Column(...) declarations whether annotated or not.
            col_target: ast.Name | None = None
            col_value: ast.Call | None = None
            if isinstance(item, ast.AnnAssign) and isinstance(item.target, ast.Name):
                col_target = item.target
                if isinstance(item.value, ast.Call):
                    col_value = item.value
            elif isinstance(item, ast.Assign) and len(item.targets) == 1:
                tgt = item.targets[0]
                if isinstance(tgt, ast.Name) and isinstance(item.value, ast.Call):
                    col_target = tgt
                    col_value = item.value

            if col_target is not None and col_value is not None:
                func = col_value.func
                is_column_call = (
                    (isinstance(func, ast.Name) and func.id == "Column")
                    or (isinstance(func, ast.Attribute) and func.attr == "Column")
                )
                if is_column_call:
                    type_str = "?"
                    if col_value.args:
                        type_str = ast.unparse(col_value.args[0])
                    columns.append((col_target.id, type_str))
        if tablename:
            tables[tablename] = columns
    return tables, set(tables)


def _collect_migration_statements() -> tuple[set[tuple[str, str]], dict[str, set[str]]]:
    """Return ({(table, col) covered via ALTER}, {table: {col, ...}} via CREATE).

    A column is "covered" if it appears in either:
      - an ``ALTER TABLE <table> ADD COLUMN IF NOT EXISTS <col>`` (added later)
      - a ``CREATE TABLE IF NOT EXISTS <table> (... <col> ...)`` (initial)

    Columns that appear ONLY in a CREATE TABLE for their table are
    considered "initial" and need no separate ALTER TABLE migration —
    SQLAlchemy's Base.metadata.create_all() emits the CREATE TABLE on
    first app startup.
    """
    text = MIGRATIONS.read_text()
    # The migration file uses Python's implicit string concatenation
    # (`"ALTER TABLE ... ADD COLUMN IF NOT EXISTS " \n "col TYPE"`) so a
    # regex over the raw source misses ALTER statements that span two
    # adjacent string literals. Collapse those into a single token
    # stream before searching.
    text = re.sub(r'"\s*\n\s*"', " ", text)
    # ALTER TABLE <table> ADD COLUMN IF NOT EXISTS <column>
    alter_re = re.compile(
        r"ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+(\w+)",
        re.IGNORECASE,
    )
    alter_columns: set[tuple[str, str]] = set()
    for m in alter_re.finditer(text):
        alter_columns.add((m.group(1).lower(), m.group(2).lower()))

    # CREATE TABLE IF NOT EXISTS <table> ( ... )
    # For each match, capture everything inside the parens and harvest
    # every identifier that sits at column-definition position. We use a
    # permissive regex because migrations split column definitions across
    # multiple lines and the type keywords vary widely (INTEGER, SERIAL,
    # VARCHAR, TEXT, BOOLEAN, TIMESTAMP, JSONB, plus PK/UNIQUE/CHECK/
    # REFERENCES/DEFAULT/NOT NULL constraints).
    #
    # The terminator after the closing `)` is `"""` (Python triple-quote)
    # OR `;` (raw SQL terminator) OR end-of-file — any of these end the
    # CREATE TABLE statement. Without the `"""` case the regex would
    # keep matching past the closing paren until the next `);` elsewhere
    # in the file (e.g. a UNIQUE constraint in a sibling statement),
    # capturing identifiers from outside the intended block.
    create_re = re.compile(
        r'CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(\w+)\s*\((.*?)\)\s*(?:""""|;|$)',
        re.IGNORECASE | re.DOTALL,
    )
    create_columns: dict[str, set[str]] = {}
    for m in create_re.finditer(text):
        table = m.group(1).lower()
        col_list = m.group(2)
        # Tokens inside the parens: column names are identifiers that
        # appear either at the start of a line, or as the very first
        # identifier before a SQL keyword / type. Pull them all out.
        col_names: set[str] = set()
        # Match every identifier followed by whitespace + a SQL type or
        # constraint keyword. Allows multi-line column definitions.
        for col_match in re.finditer(
            r"(?m)^\s*([A-Za-z_]\w*)\s+(?:INTEGER|SERIAL(?: PRIMARY KEY)?|VARCHAR|TEXT|BOOLEAN|TIMESTAMP|DATE|JSONB?|UUID|PRIMARY KEY|UNIQUE|REFERENCES|CONSTRAINT|CHECK|DEFAULT)\b",
            col_list,
        ):
            name = col_match.group(1).lower()
            if name not in {"primary", "unique", "references", "constraint", "check", "default", "not", "null"}:
                col_names.add(name)
        # Also catch inline column names without a type keyword (e.g.
        # backslash-line continuations). Any identifier at start-of-line
        # that isn't a known constraint keyword counts as a column.
        for col_match in re.finditer(r"(?m)^\s*([A-Za-z_]\w*)\b", col_list):
            name = col_match.group(1).lower()
            if name in {"primary", "unique", "references", "constraint", "check", "default", "not", "null"}:
                continue
            if name in {"integer", "serial", "varchar", "text", "boolean", "timestamp", "date", "jsonb", "json", "uuid"}:
                continue
            col_names.add(name)
        create_columns[table] = col_names

    return alter_columns, create_columns


def test_every_column_has_a_migration():
    """Every Column declared in db_models.py must be in migrate_and_start.py.

    Three consecutive cycles (9, 10, 11) shipped a feat that added a
    column to db_models.py but forgot to add the matching
    ``ALTER TABLE ADD COLUMN IF NOT EXISTS`` to migrate_and_start.py.
    Without the migration, prod Postgres rejects the new-column write
    the moment a code path touches it. This test fails CI on that
    drift so a future commit can't repeat the pattern.

    The rule distinguishes two cases:

    1. **CREATE TABLE-managed tables** (those that have a
       ``CREATE TABLE IF NOT EXISTS <table>`` in migrate_and_start.py):
       every column listed in that CREATE TABLE statement is "initial"
       (created by the CREATE TABLE on first deploy). Any column that
       appears in db_models.py but NOT in the CREATE TABLE statement
       must have an ``ALTER TABLE ADD COLUMN IF NOT EXISTS`` entry,
       because the table already exists in production and create_all
       won't add the new column.

    2. **create_all-managed tables** (those that only have
       ``ALTER TABLE`` entries in migrate_and_start.py): the table is
       created by SQLAlchemy's ``Base.metadata.create_all()`` at app
       startup, which emits the CREATE TABLE with all current columns.
       These tables don't need a CREATE TABLE entry in migrations at
       all — every column on them is initial, and the guard only
       verifies that any new column gets an ALTER TABLE.

    In practice this means: for any column NOT covered by ALTER TABLE,
    it must appear in the CREATE TABLE statement for the same table
    IF the table has a CREATE TABLE entry. Tables without a CREATE
    TABLE entry are exempt from the CREATE TABLE check — those tables
    are managed entirely by SQLAlchemy's Base.metadata.create_all() and
    any column added to them via the model is covered by create_all on
    a fresh DB. Production safety on existing DBs is preserved by the
    ALTER TABLE check above: if you ADD a new column to a create_all-
    managed table, you MUST add an ALTER TABLE for it, and this test
    will catch that.
    """
    tables, _ = _parse_db_models()
    alter_columns, create_columns = _collect_migration_statements()

    missing: list[str] = []
    for table, cols in tables.items():
        create_cols = create_columns.get(table.lower())
        has_create_table = bool(create_cols)
        for col_name, _type_str in cols:
            key = (table.lower(), col_name.lower())
            if key in alter_columns:
                # Covered by an ALTER TABLE migration.
                continue
            if has_create_table and col_name.lower() in create_cols:
                # Listed in the CREATE TABLE statement — handled by
                # the table's initial create.
                continue
            # For create_all-managed tables, columns on a FRESH database
            # are emitted by SQLAlchemy's Base.metadata.create_all() at
            # app startup. But once a column exists in production, a new
            # column added to the model is NOT auto-added to existing
            # rows — that requires an explicit ALTER TABLE. Without one,
            # the new column is missing from production until the next
            # alembic upgrade. The guard must catch that drift, which
            # means a column on a create_all-managed table MUST either
            # (a) be in an ALTER TABLE or (b) be in the column name list
            # of an INITIAL-SCHEMA snapshot of the model — but we don't
            # have that snapshot. So the practical rule is: every column
            # needs an explicit migration path. Allow explicit
            # _ALLOWLISTED_OMISSIONS entries for tables whose initial
            # schema is known.
            for allowlisted in _ALLOWLISTED_OMISSIONS:
                if (
                    allowlisted[0].lower() == table.lower()
                    and (allowlisted[1] is None or allowlisted[1].lower() == col_name.lower())
                ):
                    break
            else:
                missing.append(f"{table}.{col_name}")

    assert not missing, (
        "db_models.py declares columns missing from migrate_and_start.py "
        "(without an _ALLOWLISTED_OMISSIONS entry):\n  "
        + "\n  ".join(sorted(missing))
        + "\n\nAdd ALTER TABLE ADD COLUMN IF NOT EXISTS to "
        "migrate_and_start.py for each, or extend _ALLOWLISTED_OMISSIONS "
        "in tests/test_migration_drift.py with a justification."
    )