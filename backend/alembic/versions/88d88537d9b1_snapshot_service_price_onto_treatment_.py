"""snapshot service price onto treatment at start

Revision ID: 88d88537d9b1
Revises: 1b465b86e6fb
Create Date: 2026-08-17 14:52:48.008016

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '88d88537d9b1'
down_revision: Union[str, Sequence[str], None] = '1b465b86e6fb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Nullable first so existing rows can be backfilled before the NOT NULL
    # is enforced. Backfill uses each treatment's *current* service price —
    # the best available number for treatments that predate this fix, since
    # no price-at-the-time history exists for them. Every treatment started
    # from now on gets a true snapshot via the application code.
    op.add_column('treatments', sa.Column('service_price', sa.Numeric(precision=10, scale=2), nullable=True))
    op.execute(
        "UPDATE treatments t SET service_price = s.listed_price "
        "FROM services s WHERE t.service_id = s.id"
    )
    op.execute("UPDATE treatments SET service_price = 0 WHERE service_price IS NULL")
    op.alter_column('treatments', 'service_price', nullable=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('treatments', 'service_price')
