"""add agent task share links

Adds an optional, unguessable share token to agent_tasks so users can
publish a completed Agent Mode report as a public link and revoke it later.
The token column is unique so the public read route can look up by token
without enumeration, and NULL means "not shared".

Revision ID: c3f5a9b2d1e7
Revises: b6d3f4a2c9e1
Create Date: 2026-08-14

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c3f5a9b2d1e7"
down_revision: Union[str, Sequence[str], None] = "b6d3f4a2c9e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "agent_tasks",
        sa.Column("share_token", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "agent_tasks",
        sa.Column("share_created_at", sa.DateTime(), nullable=True),
    )
    op.create_index(
        "ix_agent_tasks_share_token",
        "agent_tasks",
        ["share_token"],
        unique=True,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_agent_tasks_share_token", table_name="agent_tasks")
    op.drop_column("agent_tasks", "share_created_at")
    op.drop_column("agent_tasks", "share_token")
