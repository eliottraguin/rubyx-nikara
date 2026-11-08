"""Add a mailbox category to conversations.

Revision ID: 0016_courrier_mailbox
Revises: 0015_retire_expedition_engine
"""
from alembic import op
import sqlalchemy as sa

revision = "0016_courrier_mailbox"
down_revision = "0015_retire_expedition_engine"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("conversations", sa.Column("mailbox", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("conversations", "mailbox")
