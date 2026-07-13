"""add razorpay subscriptions table and user billing columns

Revision ID: c4f8a1b2d3e4
Revises: 68be02708337
Create Date: 2026-03-09

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c4f8a1b2d3e4"
down_revision: Union[str, Sequence[str], None] = "68be02708337"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "subscriptions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("razorpay_subscription_id", sa.String(length=64), nullable=False),
        sa.Column("razorpay_customer_id", sa.String(length=64), nullable=True),
        sa.Column("plan_id", sa.String(length=64), nullable=False),
        sa.Column("plan_name", sa.String(length=128), nullable=False),
        sa.Column("tier", sa.String(length=16), nullable=False),
        sa.Column("billing_period", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="created"),
        sa.Column("current_start", sa.DateTime(), nullable=True),
        sa.Column("current_end", sa.DateTime(), nullable=True),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=8), nullable=False, server_default="INR"),
        sa.Column("payment_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_subscriptions_id"), "subscriptions", ["id"], unique=False)
    op.create_index(
        "ix_subscriptions_razorpay_subscription_id",
        "subscriptions",
        ["razorpay_subscription_id"],
        unique=True,
    )

    op.add_column("users", sa.Column("razorpay_customer_id", sa.String(length=64), nullable=True))
    op.add_column("users", sa.Column("subscription_id", sa.Integer(), nullable=True))
    op.add_column("users", sa.Column("subscription_status", sa.String(length=32), nullable=True))
    op.add_column("users", sa.Column("subscription_end_date", sa.DateTime(), nullable=True))
    op.create_foreign_key(
        "fk_users_subscription_id",
        "users",
        "subscriptions",
        ["subscription_id"],
        ["id"],
        use_alter=True,
    )


def downgrade() -> None:
    op.drop_constraint("fk_users_subscription_id", "users", type_="foreignkey", use_alter=True)
    op.drop_column("users", "subscription_end_date")
    op.drop_column("users", "subscription_status")
    op.drop_column("users", "subscription_id")
    op.drop_column("users", "razorpay_customer_id")
    op.drop_index("ix_subscriptions_razorpay_subscription_id", table_name="subscriptions")
    op.drop_index(op.f("ix_subscriptions_id"), table_name="subscriptions")
    op.drop_table("subscriptions")
