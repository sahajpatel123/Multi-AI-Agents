"""add processed_webhook_events idempotency ledger

Revision ID: b8d4f02c3e15
Revises: a7c3e91f2b04
Create Date: 2026-07-22 02:20:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b8d4f02c3e15"
down_revision: Union[str, Sequence[str], None] = "a7c3e91f2b04"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "processed_webhook_events",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("event_key", sa.String(length=128), nullable=False),
        sa.Column("event_name", sa.String(length=64), nullable=True),
        sa.Column("processed_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("event_key", name="uq_processed_webhook_events_event_key"),
    )
    op.create_index(
        "ix_processed_webhook_events_event_key",
        "processed_webhook_events",
        ["event_key"],
        unique=False,
    )
    op.create_index(
        "ix_processed_webhook_events_expires_at",
        "processed_webhook_events",
        ["expires_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_processed_webhook_events_expires_at",
        table_name="processed_webhook_events",
    )
    op.drop_index(
        "ix_processed_webhook_events_event_key",
        table_name="processed_webhook_events",
    )
    op.drop_table("processed_webhook_events")
