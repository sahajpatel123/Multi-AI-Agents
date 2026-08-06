"""add_pinned_at_to_saved_responses

Adds an optional pinned_at timestamp so Plus/Pro users can keep
important saved takes at the top of their sidebar list.

Revision ID: b6d3f4a2c9e1
Revises: a5c9e2d1b4f8
Create Date: 2026-08-07

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b6d3f4a2c9e1"
down_revision: Union[str, Sequence[str], None] = "a5c9e2d1b4f8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "saved_responses",
        sa.Column("pinned_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("saved_responses", "pinned_at")
