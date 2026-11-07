"""campagnes de pub et versions de kit (API-P1)

Revision ID: 0008_campaigns
Revises: 0007

NOTE DE FUSION : cette migration suppose que `0007_conversations` (messagerie) existe ; l'ordre de fusion prévu est
carnet, messagerie, pub.

- `campaigns` : une campagne par ligne (compteur de concurrence `version`), supprimée avec la partie.
- `campaign_versions` : kits **immuables** (trigger : aucun UPDATE), numérotés par campagne (unique `(campaign_id, numero)`),
  supprimés avec leur campagne ; `parent_id` auto-référent pour la copie éditée.
- `campaign_requests` : journal d'idempotence des mutations de campagne (empreintes seulement, jamais la clé en clair).
"""
import sqlalchemy as sa
from alembic import op

revision = "0008_campaigns"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "campaigns",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("session_id", sa.String(), nullable=False),
        sa.Column("nom", sa.String(), nullable=False),
        sa.Column("objectif", sa.String(), nullable=False),
        sa.Column("plateforme", sa.String(), nullable=False),
        sa.Column("audience", sa.Text(), nullable=False),
        sa.Column("budget_indicatif", sa.String(), nullable=True),
        sa.Column("consigne", sa.Text(), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["game_sessions.id"], name="fk_campaigns_session_id_game_sessions", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_campaigns"),
    )
    op.create_index("ix_campaigns_session_id", "campaigns", ["session_id"])
    op.create_table(
        "campaign_versions",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("campaign_id", sa.String(), nullable=False),
        sa.Column("numero", sa.Integer(), nullable=False),
        sa.Column("parent_id", sa.String(), nullable=True),
        sa.Column("auteur", sa.String(), nullable=False),
        sa.Column("kit", sa.JSON(), nullable=False),
        sa.Column("checks", sa.JSON(), nullable=False),
        sa.Column("consigne", sa.Text(), nullable=True),
        sa.Column("profile_version", sa.Integer(), nullable=True),
        sa.Column("simule", sa.Boolean(), nullable=False),
        sa.Column("action_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["campaign_id"], ["campaigns.id"], name="fk_campaign_versions_campaign_id_campaigns", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["parent_id"], ["campaign_versions.id"], name="fk_campaign_versions_parent_id_campaign_versions", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["action_id"], ["action_runs.id"], name="fk_campaign_versions_action_id_action_runs", ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name="pk_campaign_versions"),
        sa.UniqueConstraint("campaign_id", "numero", name="uq_campaign_versions_campaign_id_numero"),
    )
    op.create_index("ix_campaign_versions_campaign_id", "campaign_versions", ["campaign_id"])
    op.create_table(
        "campaign_requests",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("session_id", sa.String(), nullable=False),
        sa.Column("key_hash", sa.String(), nullable=False),
        sa.Column("request_hash", sa.String(), nullable=False),
        sa.Column("status_code", sa.Integer(), nullable=False),
        sa.Column("response", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["game_sessions.id"], name="fk_campaign_requests_session_id_game_sessions", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_campaign_requests"),
        sa.UniqueConstraint("session_id", "key_hash", name="uq_campaign_requests_session_id_key_hash"),
    )
    # Un kit est immuable : toute modification est refusée par la base (suppression en cascade toujours permise).
    op.execute(
        """
        CREATE TRIGGER trg_campaign_versions_immutable
        BEFORE UPDATE ON campaign_versions
        BEGIN
            SELECT RAISE(ABORT, 'une version de kit de campagne est immuable');
        END
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_campaign_versions_immutable")
    op.drop_table("campaign_requests")
    op.drop_index("ix_campaign_versions_campaign_id", table_name="campaign_versions")
    op.drop_table("campaign_versions")
    op.drop_index("ix_campaigns_session_id", table_name="campaigns")
    op.drop_table("campaigns")
