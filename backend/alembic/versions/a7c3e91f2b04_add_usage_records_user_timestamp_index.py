"""add usage_records (user_id, timestamp) composite index

Revision ID: a7c3e91f2b04
Revises: 09b5ea72b4a9
Create Date: 2026-07-22 01:50:00.000000

Hot-path: get_today_token_usage filters on user_id + timestamp >= UTC midnight.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "a7c3e91f2b04"
down_revision: Union[str, Sequence[str], None] = "09b5ea72b4a9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "idx_usage_records_user_timestamp",
        "usage_records",
        ["user_id", "timestamp"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "idx_usage_records_user_timestamp",
        table_name="usage_records",
    )
