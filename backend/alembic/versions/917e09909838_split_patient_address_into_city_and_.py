"""split patient address into city and sector

Revision ID: 917e09909838
Revises: 4e63788aef51
Create Date: 2026-08-25 14:21:41.990188

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '917e09909838'
down_revision: Union[str, Sequence[str], None] = '4e63788aef51'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Nullable at first so existing rows don't fail the NOT NULL check
    # before they're backfilled below.
    op.add_column('patients', sa.Column('city', sa.String(length=80), nullable=True))
    op.add_column('patients', sa.Column('sector', sa.String(length=80), nullable=True))

    # The old free-text address can't be reliably split into city/sector
    # automatically (it was never structured that way) — move the whole
    # thing into sector so nothing is lost, leave city blank. Existing
    # patients get fixed up once, by hand, via the edit form.
    op.execute("UPDATE patients SET sector = COALESCE(address, ''), city = ''")

    op.alter_column('patients', 'city', nullable=False)
    op.alter_column('patients', 'sector', nullable=False)
    op.drop_column('patients', 'address')


def downgrade() -> None:
    """Downgrade schema."""
    op.add_column('patients', sa.Column('address', sa.TEXT(), autoincrement=False, nullable=True))
    op.execute("UPDATE patients SET address = TRIM(BOTH ', ' FROM sector || ', ' || city)")
    op.alter_column('patients', 'address', nullable=False)
    op.drop_column('patients', 'sector')
    op.drop_column('patients', 'city')
