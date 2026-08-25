"""consultation chief complaint, oral examination, rx

Revision ID: df0a9b2fc3b1
Revises: 4252b77c0068
Create Date: 2026-08-25 16:29:31.717919

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'df0a9b2fc3b1'
down_revision: Union[str, Sequence[str], None] = '4252b77c0068'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Rename, not drop+add — autogenerate can't tell this apart from an
    # unrelated column removal + addition, but it's the same data, just a
    # clearer clinical label. A plain rename preserves every existing row.
    op.alter_column('consultations', 'findings', new_column_name='oral_examination')

    # New columns — nullable=True at first so existing rows aren't rejected,
    # backfilled, then locked to NOT NULL to match the model.
    op.add_column('consultations', sa.Column('chief_complaint', sa.Text(), nullable=True))
    op.add_column(
        'consultations', sa.Column('rx', postgresql.JSONB(astext_type=sa.Text()), nullable=True)
    )
    op.execute("UPDATE consultations SET chief_complaint = '' WHERE chief_complaint IS NULL")
    op.execute("UPDATE consultations SET rx = '[]'::jsonb WHERE rx IS NULL")
    op.alter_column('consultations', 'chief_complaint', nullable=False)
    op.alter_column('consultations', 'rx', nullable=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('consultations', 'rx')
    op.drop_column('consultations', 'chief_complaint')
    op.alter_column('consultations', 'oral_examination', new_column_name='findings')
