"""add_max_score_to_export_presets

Revision ID: 71e7b89992d1
Revises: b8d4f02c3e15
Create Date: 2026-08-04 22:20:13.983352

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '71e7b89992d1'
down_revision: Union[str, Sequence[str], None] = 'b8d4f02c3e15'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('export_presets', sa.Column('max_score', sa.Integer(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('export_presets', 'max_score')
