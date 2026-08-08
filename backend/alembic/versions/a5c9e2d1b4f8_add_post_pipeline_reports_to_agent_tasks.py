"""add_post_pipeline_reports_to_agent_tasks

Persists the post-pipeline research reports (source integrity,
assumptions, dissent report, temporal profile, steelman) onto
agent_tasks so reloaded /result and saved-task payloads return the
same reports the live blackboard produced.

Idempotent: safe if some columns already exist (e.g. partial prod
state or a concurrent rollout).

Revision ID: a5c9e2d1b4f8
Revises: 71e7b89992d1
Create Date: 2026-08-06

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision: str = "a5c9e2d1b4f8"
down_revision: Union[str, Sequence[str], None] = "71e7b89992d1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_REPORT_COLUMNS = (
    ("source_integrity", "source_integrity"),
    ("assumptions", "assumptions"),
    ("dissent_report", "dissent_report"),
    ("temporal_profile", "temporal_profile"),
    ("steelman", "steelman"),
)


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    insp = inspect(bind)
    existing = {c["name"] for c in insp.get_columns("agent_tasks")}

    for column_name, _ in _REPORT_COLUMNS:
        if column_name not in existing:
            op.add_column(
                "agent_tasks",
                sa.Column(column_name, sa.JSON(), nullable=True),
            )


def downgrade() -> None:
    """Downgrade schema."""
    bind = op.get_bind()
    insp = inspect(bind)
    existing = {c["name"] for c in insp.get_columns("agent_tasks")}

    for column_name, _ in reversed(_REPORT_COLUMNS):
        if column_name in existing:
            op.drop_column("agent_tasks", column_name)
