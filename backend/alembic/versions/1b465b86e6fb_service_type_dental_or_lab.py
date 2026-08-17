"""service type - dental or lab

Revision ID: 1b465b86e6fb
Revises: 38f1dd5f3681
Create Date: 2026-08-17 14:49:37.735016

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1b465b86e6fb'
down_revision: Union[str, Sequence[str], None] = '38f1dd5f3681'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # op.add_column (unlike op.create_table) doesn't auto-issue CREATE TYPE
    # for a brand-new enum — has to be created explicitly first.
    service_type_enum = sa.Enum('dental', 'lab', name='service_type')
    service_type_enum.create(op.get_bind(), checkfirst=True)
    # server_default so this is safe to add NOT NULL against existing rows
    # (they all become 'dental', which is the actual default for every
    # service in the catalog today); dropped again once backfilled.
    op.add_column(
        'services',
        sa.Column('service_type', service_type_enum, nullable=False, server_default='dental'),
    )
    op.alter_column('services', 'service_type', server_default=None)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('services', 'service_type')
    sa.Enum(name='service_type').drop(op.get_bind(), checkfirst=True)
