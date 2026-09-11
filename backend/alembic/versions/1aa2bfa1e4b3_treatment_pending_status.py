"""treatment pending status

Revision ID: 1aa2bfa1e4b3
Revises: 8defe9dafa8e
Create Date: 2026-09-11 11:05:00.410181

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '1aa2bfa1e4b3'
down_revision: Union[str, Sequence[str], None] = '8defe9dafa8e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Postgres can't add an enum value inside the same transaction the rest
    # of a migration runs in — this has to commit on its own first.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE treatment_status ADD VALUE IF NOT EXISTS 'pending'")

    # A treatment added from the Treatments tab has neither yet — no
    # consultation (it isn't tied to one), no start date (it hasn't
    # started). Existing rows are untouched either way.
    op.alter_column('treatments', 'consultation_id', nullable=True)
    op.alter_column('treatments', 'started_at', nullable=True)


def downgrade() -> None:
    # Only safe if no 'pending' rows exist — a real pending treatment has no
    # started_at/consultation_id to backfill, so this will fail on a
    # database that actually has any. Same story for removing 'pending'
    # from the enum: Postgres has no DROP VALUE, so that part can't be
    # undone at all — left in place.
    op.alter_column('treatments', 'started_at', existing_type=None, nullable=False)
    op.alter_column('treatments', 'consultation_id', existing_type=None, nullable=False)
