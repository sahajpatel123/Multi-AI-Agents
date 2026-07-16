"""add revoked_tokens table for persistent JWT blacklist

Revision ID: a1b2c3d4e5f6
Revises: c4f8a1b2d3e4
Create Date: 2026-07-16

Replaces the per-process in-memory TokenBlacklist with a Postgres-backed
list so multi-worker Render deployments and process restarts don't grant
revoked tokens a fresh window of validity.

The table stores the SHA-256 hash of the raw token, not the token itself,
so a stolen DB row does not give an attacker any JWT to replay. The
`expires_at` column carries the JWT's `exp` claim; the index on it is
what the lazy-cleanup query at lookup time uses to keep the working set
bounded.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "c4f8a1b2d3e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "revoked_tokens",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=False),
        sa.Column("reason", sa.String(length=64), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash", name="uq_revoked_tokens_hash"),
    )
    op.create_index(
        op.f("ix_revoked_tokens_token_hash"),
        "revoked_tokens",
        ["token_hash"],
        unique=True,
    )
    op.create_index(
        op.f("ix_revoked_tokens_expires_at"),
        "revoked_tokens",
        ["expires_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_revoked_tokens_expires_at"), table_name="revoked_tokens")
    op.drop_index(op.f("ix_revoked_tokens_token_hash"), table_name="revoked_tokens")
    op.drop_table("revoked_tokens")
