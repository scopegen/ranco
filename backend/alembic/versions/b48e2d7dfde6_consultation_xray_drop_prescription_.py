"""consultation xray, drop prescription next visit

Revision ID: b48e2d7dfde6
Revises: 1aa2bfa1e4b3
Create Date: 2026-09-11 14:20:33.503395

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b48e2d7dfde6'
down_revision: Union[str, Sequence[str], None] = '1aa2bfa1e4b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('consultations', sa.Column('xray_done', sa.Boolean(), nullable=True))
    op.execute("UPDATE consultations SET xray_done = false WHERE xray_done IS NULL")
    op.alter_column('consultations', 'xray_done', nullable=False)

    # Destructive on purpose — dropping the feature entirely, not just
    # hiding it. Any next-visit text already saved on existing prescriptions
    # is gone after this; there's no way back short of a backup restore.
    op.drop_column('prescription_entries', 'next_visit')


def downgrade() -> None:
    op.add_column('prescription_entries', sa.Column('next_visit', sa.String(length=120), nullable=True))
    op.drop_column('consultations', 'xray_done')
