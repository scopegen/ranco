"""add staff signature image

Revision ID: 76c941b24b8a
Revises: af4b1edf22ef
Create Date: 2026-09-14 17:11:29.475097

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '76c941b24b8a'
down_revision: Union[str, Sequence[str], None] = 'af4b1edf22ef'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('staff', sa.Column('signature_image', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('staff', 'signature_image')
