"""invoice line accepts a consultation too

Revision ID: 5992c9cfd7bd
Revises: df0a9b2fc3b1
Create Date: 2026-08-25 17:51:25.368389

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5992c9cfd7bd'
down_revision: Union[str, Sequence[str], None] = 'df0a9b2fc3b1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('invoice_lines', sa.Column('consultation_id', sa.UUID(), nullable=True))
    # A treatment-only line can now be a consultation-only line instead —
    # exactly one of the two is enforced by the check constraint below, not
    # by NOT NULL on either column alone.
    op.alter_column('invoice_lines', 'treatment_id', existing_type=sa.UUID(), nullable=True)
    op.create_unique_constraint('uq_invoice_lines_consultation_id', 'invoice_lines', ['consultation_id'])
    op.create_foreign_key(
        'fk_invoice_lines_consultation_id_consultations',
        'invoice_lines',
        'consultations',
        ['consultation_id'],
        ['id'],
    )
    op.create_check_constraint(
        'invoice_line_exactly_one_source',
        'invoice_lines',
        '(treatment_id IS NOT NULL) != (consultation_id IS NOT NULL)',
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('invoice_line_exactly_one_source', 'invoice_lines', type_='check')
    op.drop_constraint('fk_invoice_lines_consultation_id_consultations', 'invoice_lines', type_='foreignkey')
    op.drop_constraint('uq_invoice_lines_consultation_id', 'invoice_lines', type_='unique')
    op.alter_column('invoice_lines', 'treatment_id', existing_type=sa.UUID(), nullable=False)
    op.drop_column('invoice_lines', 'consultation_id')
