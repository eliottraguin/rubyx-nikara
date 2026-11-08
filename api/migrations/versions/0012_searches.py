"""recherches du bot scout (API-S1)

Revision ID: 0012_searches
Revises: 0011_retire_old_journey_tables

- `searches` : une recherche gratuite du bot sur un lieu, supprimée avec la partie.
"""
import sqlalchemy as sa
from alembic import op

revision = "0012_searches"
down_revision = "0011_retire_old_journey_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "searches",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("session_id", sa.String(), nullable=False),
        sa.Column("planet_id", sa.String(), nullable=False),
        sa.Column("precision", sa.Text(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("found", sa.Integer(), nullable=False),
        sa.Column("kept", sa.Integer(), nullable=False),
        sa.Column("discarded", sa.Integer(), nullable=False),
        sa.Column("examined", sa.Integer(), nullable=False),
        sa.Column("profile_version", sa.Integer(), nullable=False),
        sa.Column("simule", sa.Boolean(), nullable=False),
        sa.Column("action_id", sa.String(), nullable=True),
        sa.Column("result", sa.JSON(), nullable=True),
        sa.Column("error", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["session_id"], ["game_sessions.id"], name="fk_searches_session_id_game_sessions", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_searches"),
    )
    op.create_index("ix_searches_session_id", "searches", ["session_id"])


def downgrade() -> None:
    op.drop_index("ix_searches_session_id", table_name="searches")
    op.drop_table("searches")
