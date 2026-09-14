"""price adjustment for treatments and consultations

Revision ID: c0332c372685
Revises: b48e2d7dfde6
Create Date: 2026-09-12 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c0332c372685'
down_revision: Union[str, Sequence[str], None] = 'b48e2d7dfde6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # All nullable, all optional forever — same as discount_type/
    # discount_value, no backfill needed. Increase-only — no direction
    # column, since decreasing the price is already covered by discount.
    op.add_column('treatments', sa.Column('price_adjustment_type', sa.String(length=10), nullable=True))
    op.add_column('treatments', sa.Column('price_adjustment_value', sa.Numeric(10, 2), nullable=True))

    op.add_column('consultations', sa.Column('price_adjustment_type', sa.String(length=10), nullable=True))
    op.add_column('consultations', sa.Column('price_adjustment_value', sa.Numeric(10, 2), nullable=True))


def downgrade() -> None:
    op.drop_column('consultations', 'price_adjustment_value')
    op.drop_column('consultations', 'price_adjustment_type')

    op.drop_column('treatments', 'price_adjustment_value')
    op.drop_column('treatments', 'price_adjustment_type')
