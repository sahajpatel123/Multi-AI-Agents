"""add expertise fields and name to user

Revision ID: d5e6f7a8b9c0
Revises: c4f8a1b2d3e4
Create Date: 2026-03-25

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d5e6f7a8b9c0"
down_revision: Union[str, Sequence[str], None] = "c4f8a1b2d3e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("name", sa.String(length=255), nullable=False, server_default=""))
    op.add_column(
        "users",
        sa.Column("expertise_level", sa.String(length=32), nullable=False, server_default="curious"),
    )
    op.add_column(
        "users",
        sa.Column("expertise_domain", sa.String(length=512), nullable=False, server_default=""),
    )
    op.alter_column("users", "name", server_default=None)
    op.alter_column("users", "expertise_level", server_default=None)
    op.alter_column("users", "expertise_domain", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "expertise_domain")
    op.drop_column("users", "expertise_level")
    op.drop_column("users", "name")
