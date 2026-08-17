"""invoices cover multiple treatments via invoice_lines

Revision ID: 79b4a1fcbf79
Revises: 88d88537d9b1
Create Date: 2026-08-17 16:28:42.055795

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '79b4a1fcbf79'
down_revision: Union[str, Sequence[str], None] = '88d88537d9b1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('invoice_lines',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('invoice_id', sa.UUID(), nullable=False),
    sa.Column('treatment_id', sa.UUID(), nullable=False),
    sa.Column('amount', sa.Numeric(precision=10, scale=2), nullable=False),
    sa.ForeignKeyConstraint(['invoice_id'], ['invoices.id'], ),
    sa.ForeignKeyConstraint(['treatment_id'], ['treatments.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('treatment_id')
    )
    # Every existing invoice covered exactly one treatment (the old model) —
    # carry that forward as a single line before dropping the column.
    op.execute(
        "INSERT INTO invoice_lines (id, invoice_id, treatment_id, amount) "
        "SELECT gen_random_uuid(), id, treatment_id, listed_total FROM invoices"
    )
    op.drop_constraint(op.f('invoices_treatment_id_fkey'), 'invoices', type_='foreignkey')
    op.drop_column('invoices', 'treatment_id')
    # ### end Alembic commands ###


def downgrade() -> None:
    """Downgrade schema."""
    op.add_column('invoices', sa.Column('treatment_id', sa.UUID(), autoincrement=False, nullable=True))
    op.execute(
        "UPDATE invoices SET treatment_id = "
        "(SELECT treatment_id FROM invoice_lines WHERE invoice_lines.invoice_id = invoices.id LIMIT 1)"
    )
    op.alter_column('invoices', 'treatment_id', nullable=False)
    op.create_foreign_key(op.f('invoices_treatment_id_fkey'), 'invoices', 'treatments', ['treatment_id'], ['id'])
    op.drop_table('invoice_lines')
    # ### end Alembic commands ###
