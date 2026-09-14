"""add next_calls table

Revision ID: af4b1edf22ef
Revises: c0332c372685
Create Date: 2026-09-14 13:58:51.760952

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'af4b1edf22ef'
down_revision: Union[str, Sequence[str], None] = 'c0332c372685'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'next_calls',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('patient_id', sa.UUID(), nullable=False),
        sa.Column('scheduled_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('status', sa.Enum('upcoming', 'done', name='next_call_status'), nullable=False),
        sa.Column('added_by', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id']),
        sa.ForeignKeyConstraint(['added_by'], ['staff.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    # Every list/filter query below is "this patient's calls, newest/soonest
    # first" or "all upcoming calls, soonest first" — index both directions.
    op.create_index('ix_next_calls_patient_id', 'next_calls', ['patient_id'])
    op.create_index('ix_next_calls_status_scheduled_at', 'next_calls', ['status', 'scheduled_at'])


def downgrade() -> None:
    op.drop_index('ix_next_calls_status_scheduled_at', table_name='next_calls')
    op.drop_index('ix_next_calls_patient_id', table_name='next_calls')
    op.drop_table('next_calls')
    op.execute('DROP TYPE next_call_status')
