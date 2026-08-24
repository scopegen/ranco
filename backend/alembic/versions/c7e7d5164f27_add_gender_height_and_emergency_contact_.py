"""add gender, height, and emergency contact to patients

Revision ID: c7e7d5164f27
Revises: 79b4a1fcbf79
Create Date: 2026-08-21 12:07:32.442652

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c7e7d5164f27'
down_revision: Union[str, Sequence[str], None] = '79b4a1fcbf79'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # op.add_column (unlike op.create_table) doesn't auto-issue CREATE TYPE
    # for a brand-new enum — has to be created explicitly first.
    gender_enum = sa.Enum('male', 'female', 'other', name='gender')
    gender_enum.create(op.get_bind(), checkfirst=True)
    op.add_column('patients', sa.Column('gender', gender_enum, nullable=True))
    op.add_column('patients', sa.Column('height', sa.Numeric(precision=5, scale=2), nullable=True))
    op.add_column('patients', sa.Column('emergency_contact_name', sa.String(length=120), nullable=True))
    op.add_column('patients', sa.Column('emergency_contact_phone', sa.String(length=20), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('patients', 'emergency_contact_phone')
    op.drop_column('patients', 'emergency_contact_name')
    op.drop_column('patients', 'height')
    op.drop_column('patients', 'gender')
    sa.Enum(name='gender').drop(op.get_bind(), checkfirst=True)
