"""add answer feedback user/date index for filtered exports

The feedback export endpoints filter by owner and inclusive UTC date range,
then sort newest-first. Keep that query shape indexed as feedback history
grows.

Revision ID: e4f6a8b2c1d0
Revises: c3f5a9b2d1e7
Create Date: 2026-08-18

"""

from typing import Sequence, Union

from alembic import op


revision: str = "e4f6a8b2c1d0"
down_revision: Union[str, Sequence[str], None] = "c3f5a9b2d1e7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "idx_answer_feedback_user_created",
        "answer_feedback",
        ["user_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "idx_answer_feedback_user_created",
        table_name="answer_feedback",
    )
