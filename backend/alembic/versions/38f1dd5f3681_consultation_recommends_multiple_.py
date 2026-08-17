"""consultation recommends multiple services plus free text note

Revision ID: 38f1dd5f3681
Revises: eec0f2b686c4
Create Date: 2026-08-17 14:35:26.337875

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '38f1dd5f3681'
down_revision: Union[str, Sequence[str], None] = 'eec0f2b686c4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # server_default='{}' so this is safe to add NOT NULL against existing
    # rows; dropped again below once the backfill has run.
    op.add_column(
        'consultations',
        sa.Column('recommended_service_ids', postgresql.ARRAY(sa.UUID()), nullable=False, server_default='{}'),
    )
    op.add_column('consultations', sa.Column('recommendation_note', sa.Text(), nullable=True))
    # Carry each existing single recommendation forward as a one-item list.
    op.execute(
        "UPDATE consultations SET recommended_service_ids = ARRAY[recommended_service_id] "
        "WHERE recommended_service_id IS NOT NULL"
    )
    op.drop_constraint(op.f('consultations_recommended_service_id_fkey'), 'consultations', type_='foreignkey')
    op.drop_column('consultations', 'recommended_service_id')
    op.alter_column('consultations', 'recommended_service_ids', server_default=None)


def downgrade() -> None:
    """Downgrade schema."""
    op.add_column('consultations', sa.Column('recommended_service_id', sa.UUID(), autoincrement=False, nullable=True))
    # Postgres arrays are 1-indexed — first recommended service wins.
    op.execute(
        "UPDATE consultations SET recommended_service_id = recommended_service_ids[1] "
        "WHERE array_length(recommended_service_ids, 1) > 0"
    )
    op.create_foreign_key(op.f('consultations_recommended_service_id_fkey'), 'consultations', 'services', ['recommended_service_id'], ['id'])
    op.drop_column('consultations', 'recommendation_note')
    op.drop_column('consultations', 'recommended_service_ids')
