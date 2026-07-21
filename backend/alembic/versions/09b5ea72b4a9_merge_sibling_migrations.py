"""merge sibling migrations

Revision ID: 09b5ea72b4a9
Revises: d5e6f7a8b9c0, a1b2c3d4e5f6
Create Date: 2026-07-21 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "09b5ea72b4a9"
down_revision: Union[str, Sequence[str], None] = ("d5e6f7a8b9c0", "a1b2c3d4e5f6")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
