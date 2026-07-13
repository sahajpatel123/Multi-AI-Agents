"""add_expertise_fields_to_user

Adds name, expertise_level, and expertise_domain to users when missing.
Idempotent: safe if some columns already exist (e.g. partial prod state).

Revision ID: d5e6f7a8b9c0
Revises: c4f8a1b2d3e4
Create Date: 2026-03-25

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision: str = "d5e6f7a8b9c0"
down_revision: Union[str, Sequence[str], None] = "c4f8a1b2d3e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    existing = {c["name"] for c in insp.get_columns("users")}

    if "name" not in existing:
        op.add_column(
            "users",
            sa.Column("name", sa.String(length=255), nullable=False, server_default=""),
        )
        op.alter_column("users", "name", server_default=None)

    if "expertise_level" not in existing:
        op.add_column(
            "users",
            sa.Column(
                "expertise_level",
                sa.String(length=32),
                nullable=False,
                server_default="curious",
            ),
        )
        op.alter_column("users", "expertise_level", server_default=None)

    if "expertise_domain" not in existing:
        op.add_column(
            "users",
            sa.Column(
                "expertise_domain",
                sa.String(length=512),
                nullable=False,
                server_default="",
            ),
        )
        op.alter_column("users", "expertise_domain", server_default=None)


def downgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    existing = {c["name"] for c in insp.get_columns("users")}
    for col in ("expertise_domain", "expertise_level", "name"):
        if col in existing:
            op.drop_column("users", col)
