"""retrait de l'ancien parcours : tables `notebook_entries` (carnet de prompts) et `applied_events` (événements de brief)

Revision ID: 0011_retire_old_journey_tables
Revises: 0010_assistant_plans

6e décision (API-R2) : plus de carnet de prompts ni d'événements de marché. Les deux tables n'étaient lues par aucune route
restante. Réversible : `downgrade` recrée les tables (vides). Les tables `submissions` et `evaluations` sont CONSERVÉES (le
déblocage du hangar lit encore des évaluations héritées ; à remplacer par API-S4), ainsi que les colonnes de `mission_attempts`.
"""
import sqlalchemy as sa
from alembic import op

revision = "0011_retire_old_journey_tables"
down_revision = "0010_assistant_plans"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("notebook_entries", schema=None) as batch_op:
        batch_op.drop_index("ix_notebook_entries_session_id")
    op.drop_table("notebook_entries")
    op.drop_table("applied_events")


def downgrade() -> None:
    op.create_table(
        "applied_events",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("attempt_id", sa.String(), nullable=False),
        sa.Column("event_id", sa.String(), nullable=False),
        sa.Column("brief_version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["attempt_id"], ["mission_attempts.id"], name=op.f("fk_applied_events_attempt_id_mission_attempts"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_applied_events")),
        sa.UniqueConstraint("attempt_id", "event_id", name=op.f("uq_applied_events_attempt_id_event_id")),
    )
    op.create_table(
        "notebook_entries",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("session_id", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("mission_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["game_sessions.id"], name=op.f("fk_notebook_entries_session_id_game_sessions"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_notebook_entries")),
    )
    with op.batch_alter_table("notebook_entries", schema=None) as batch_op:
        batch_op.create_index("ix_notebook_entries_session_id", ["session_id"], unique=False)
