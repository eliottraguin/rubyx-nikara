"""fiches clients et premiers messages d'un prospect (API-J1, API-K1)

Revision ID: 0014_prospect_drafts
Revises: 0013_pertinence_labels

- `prospect_drafts` : versions **immuables** (trigger : aucun UPDATE) de fiche client et de brouillon de premier message,
  numérotées par `(prospect, kind)` ; supprimées en cascade avec le prospect et avec la partie.
Additive et réversible.
"""
import sqlalchemy as sa
from alembic import op

revision = "0014_prospect_drafts"
down_revision = "0013_pertinence_labels"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "prospect_drafts",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("session_id", sa.String(), nullable=False),
        sa.Column("prospect_id", sa.String(), nullable=False),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("numero", sa.Integer(), nullable=False),
        sa.Column("parent_id", sa.String(), nullable=True),
        sa.Column("auteur", sa.String(), nullable=False),
        sa.Column("contenu", sa.JSON(), nullable=False),
        sa.Column("controles", sa.JSON(), nullable=False),
        sa.Column("consigne", sa.Text(), nullable=True),
        sa.Column("profile_version", sa.Integer(), nullable=False),
        sa.Column("simule", sa.Boolean(), nullable=False),
        sa.Column("action_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["game_sessions.id"], name="fk_prospect_drafts_session_id_game_sessions", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["prospect_id"], ["prospects.id"], name="fk_prospect_drafts_prospect_id_prospects", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["parent_id"], ["prospect_drafts.id"], name="fk_prospect_drafts_parent_id_prospect_drafts", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_prospect_drafts"),
        sa.UniqueConstraint("prospect_id", "kind", "numero", name="uq_prospect_drafts_prospect_id_kind_numero"),
    )
    op.create_index("ix_prospect_drafts_prospect_id", "prospect_drafts", ["prospect_id"])
    op.create_index("ix_prospect_drafts_session_id", "prospect_drafts", ["session_id"])
    # Versions immuables (invariant 1 de DATA-MODEL.md) : la base refuse toute modification.
    op.execute(
        """
        CREATE TRIGGER trg_prospect_drafts_immutable
        BEFORE UPDATE ON prospect_drafts
        BEGIN
            SELECT RAISE(ABORT, 'prospect_drafts est immuable');
        END
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_prospect_drafts_immutable")
    op.drop_index("ix_prospect_drafts_session_id", table_name="prospect_drafts")
    op.drop_index("ix_prospect_drafts_prospect_id", table_name="prospect_drafts")
    op.drop_table("prospect_drafts")
