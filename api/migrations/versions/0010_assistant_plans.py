"""plans des assistants personnels (ASSIST-3)

Revision ID: 0010_assistant_plans
Revises: 0009_conversations

- `assistant_plans` : un plan proposé par un assistant (liste de tâches en JSON), supprimé avec la partie.
"""
import sqlalchemy as sa
from alembic import op

revision = "0010_assistant_plans"
down_revision = "0009_conversations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "assistant_plans",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("session_id", sa.String(), nullable=False),
        sa.Column("assistant", sa.String(), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("total_cost", sa.Integer(), nullable=False),
        sa.Column("steps", sa.JSON(), nullable=False),
        sa.Column("action_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["game_sessions.id"], name="fk_assistant_plans_session_id_game_sessions", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_assistant_plans"),
    )
    op.create_index("ix_assistant_plans_session_id", "assistant_plans", ["session_id"])


def downgrade() -> None:
    op.drop_index("ix_assistant_plans_session_id", table_name="assistant_plans")
    op.drop_table("assistant_plans")
