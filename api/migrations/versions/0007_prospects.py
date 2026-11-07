"""carnet de prospection : prospects, enregistrements d'expédition, rejeu des mutations (API-I1)

Revision ID: 0007
Revises: 0005

- `expedition_records` : enregistrements renvoyés par une source pendant une expédition (déjà minimisés) ; référence de
  vérification des `source_ref`. Unique `(attempt_id, source, source_ref)`. Cascade avec la partie et l'expédition.
- `prospects` : unique `(session_id, source, source_ref)` (dédoublonnage) ; provenance immuable (trigger : tout UPDATE
  d'une colonne de provenance est refusé) ; cascade avec la partie (aucune ligne orpheline).
- `prospect_idempotency` : rejeu des mutations (empreintes + identifiants, jamais de contenu ni de clé en clair).
"""
import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None

PROVENANCE = (
    "session_id, entreprise, entreprise_cle, contact_nom, contact_fonction, canal_type, canal_valeur, source, source_ref, "
    "raisons_fit, signal, pertinence, fiabilite, simule, instantane, collecte_le, expedition_id, rapport_version_id, "
    "profile_version, cree_le"
)


def upgrade() -> None:
    op.create_table(
        "expedition_records",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("session_id", sa.String(), nullable=False),
        sa.Column("attempt_id", sa.String(), nullable=False),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("source_ref", sa.String(), nullable=False),
        sa.Column("record", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["game_sessions.id"], name="fk_expedition_records_session_id_game_sessions", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["attempt_id"], ["mission_attempts.id"], name="fk_expedition_records_attempt_id_mission_attempts", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_expedition_records"),
        sa.UniqueConstraint("attempt_id", "source", "source_ref", name="uq_expedition_records_attempt_id_source_source_ref"),
    )
    op.create_index("ix_expedition_records_session_id", "expedition_records", ["session_id"])
    op.create_table(
        "prospects",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("session_id", sa.String(), nullable=False),
        sa.Column("entreprise", sa.String(), nullable=False),
        sa.Column("entreprise_cle", sa.String(), nullable=False),
        sa.Column("contact_nom", sa.String(), nullable=True),
        sa.Column("contact_fonction", sa.String(), nullable=True),
        sa.Column("canal_type", sa.String(), nullable=True),
        sa.Column("canal_valeur", sa.String(), nullable=True),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("source_ref", sa.String(), nullable=False),
        sa.Column("raisons_fit", sa.JSON(), nullable=False),
        sa.Column("signal", sa.String(), nullable=True),
        sa.Column("pertinence", sa.Integer(), nullable=False),
        sa.Column("fiabilite", sa.String(), nullable=False),
        sa.Column("simule", sa.Boolean(), nullable=False),
        sa.Column("instantane", sa.JSON(), nullable=False),
        sa.Column("collecte_le", sa.String(), nullable=True),
        sa.Column("expedition_id", sa.String(), nullable=False),
        sa.Column("rapport_version_id", sa.String(), nullable=False),
        sa.Column("profile_version", sa.Integer(), nullable=False),
        sa.Column("statut", sa.String(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=False),
        sa.Column("historique", sa.JSON(), nullable=False),
        sa.Column("cree_le", sa.DateTime(timezone=True), nullable=False),
        sa.Column("modifie_le", sa.DateTime(timezone=True), nullable=False),
        sa.Column("contacte_le", sa.DateTime(timezone=True), nullable=True),
        sa.Column("derniere_activite_le", sa.DateTime(timezone=True), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["game_sessions.id"], name="fk_prospects_session_id_game_sessions", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_prospects"),
        sa.UniqueConstraint("session_id", "source", "source_ref", name="uq_prospects_session_id_source_source_ref"),
    )
    op.create_index("ix_prospects_session_id", "prospects", ["session_id"])
    op.create_index("ix_prospects_session_id_entreprise_cle", "prospects", ["session_id", "entreprise_cle"])
    op.create_table(
        "prospect_idempotency",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("session_id", sa.String(), nullable=False),
        sa.Column("key_hash", sa.String(), nullable=False),
        sa.Column("request_hash", sa.String(), nullable=False),
        sa.Column("status_code", sa.Integer(), nullable=False),
        sa.Column("result", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["game_sessions.id"], name="fk_prospect_idempotency_session_id_game_sessions", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_prospect_idempotency"),
        sa.UniqueConstraint("session_id", "key_hash", name="uq_prospect_idempotency_session_id_key_hash"),
    )
    op.execute(
        f"""
        CREATE TRIGGER trg_prospects_provenance_immutable
        BEFORE UPDATE OF {PROVENANCE} ON prospects
        BEGIN
            SELECT RAISE(ABORT, 'la provenance d''un prospect est immuable');
        END
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_prospects_provenance_immutable")
    op.drop_table("prospect_idempotency")
    op.drop_table("prospects")
    op.drop_table("expedition_records")
