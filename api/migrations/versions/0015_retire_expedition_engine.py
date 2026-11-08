"""retrait de l'ancien moteur d'expédition et d'évaluation (6e décision, API-R3)

Revision ID: 0015_retire_expedition_engine
Revises: 0014_prospect_drafts

La recherche (`searches`), le tri de pertinence, les clients obtenus, les brouillons de prospect et les assistants remplacent
l'expédition notée. Ce que la migration retire :

- tables `mission_definitions`, `mission_attempts`, `messages`, `artifact_versions`, `artifact_shares`, `submissions`,
  `evaluations`, `expedition_records` (plus aucun chemin d'écriture ni de lecture) ;
- `action_runs.attempt_id`, `reservations.attempt_id` et `reservations.quota` (clés étrangères vers `mission_attempts`) ;
- `game_sessions.stage` (étape de campagne `m1`…) ;
- le trigger d'immutabilité de `campaign_versions` est recréé SANS la colonne `action_id` : cette colonne est une clé étrangère
  `ON DELETE SET NULL` vers `action_runs`, et la suppression d'une partie (cascade vers `action_runs`) l'UPDATE ; l'ordre des
  cascades de SQLite dépend de l'ordre de création des tables (recréer `action_runs` l'a inversé, ce qui a fait échouer la
  suppression d'une partie ayant des campagnes). Le contenu d'un kit (`kit`, `checks`, `consigne`…) reste immuable ;
- `prospects.rapport_version_id` (doublon de l'identifiant de recherche) ; `prospects.expedition_id` est RENOMMÉE
  `search_id` (elle contenait déjà l'identifiant de la recherche). La provenance reste immuable : le trigger est recréé
  avec la nouvelle liste de colonnes.

Données conservées : parties, ledger (écritures jamais touchées), réservations, actions (les actions de l'ancien parcours
encore ouvertes sont closes sans débit et leurs réservations libérées), prospects (unicité `(session, source, source_ref)`
intacte), conversations, campagnes, recherches, plans d'assistant. Les messages, livrables, livraisons et évaluations de
l'ancien parcours sont supprimés avec leurs tables (contenu obsolète, jamais exposé par une route restante).

Réversible : `downgrade` recrée les tables et colonnes (vides ; `stage` = `m1`, `attempt_id` = NULL, `quota` = 0,
`rapport_version_id` = identifiant de recherche).
"""
import sqlalchemy as sa
from alembic import op

revision = "0015_retire_expedition_engine"
down_revision = "0014_prospect_drafts"
branch_labels = None
depends_on = None

PROVENANCE_COMMON = (
    "session_id, entreprise, entreprise_cle, contact_nom, contact_fonction, canal_type, canal_valeur, source, source_ref, "
    "raisons_fit, signal, pertinence, fiabilite, simule, instantane, collecte_le"
)
PROVENANCE_OLD = f"{PROVENANCE_COMMON}, expedition_id, rapport_version_id, profile_version, cree_le"
PROVENANCE_NEW = f"{PROVENANCE_COMMON}, search_id, profile_version, cree_le"

CAMPAIGN_VERSION_CONTENT = "id, campaign_id, numero, parent_id, auteur, kit, checks, consigne, profile_version, simule, created_at"

_LEGACY_ERROR = '{"code": "INVALID_STATE", "message": "Action de l\'ancien parcours close sans débit."}'


def _trigger(provenance: str) -> None:
    op.execute(
        f"""
        CREATE TRIGGER trg_prospects_provenance_immutable
        BEFORE UPDATE OF {provenance} ON prospects
        BEGIN
            SELECT RAISE(ABORT, 'la provenance d''un prospect est immuable');
        END
        """
    )


def upgrade() -> None:
    # 1. Hygiène : rien d'ouvert ne reste attaché à l'ancien parcours (réservations libérées, actions closes sans débit).
    op.execute("UPDATE reservations SET status = 'RELEASED' WHERE attempt_id IS NOT NULL AND status = 'ACTIVE'")
    op.execute(
        "UPDATE action_runs SET status = 'FAILED', error = '" + _LEGACY_ERROR.replace("'", "''") + "' "
        "WHERE attempt_id IS NOT NULL AND status IN ('PENDING', 'RESERVED', 'RUNNING', 'AWAITING_CONFIRMATION', 'PARTIAL')"
    )

    # 2. Carnet : la provenance pointe vers la recherche. Changement de colonnes SANS recréer la table (ALTER natif) ;
    #    le trigger d'immutabilité est supprimé puis recréé avec la nouvelle liste.
    op.execute("DROP TRIGGER IF EXISTS trg_prospects_provenance_immutable")
    op.execute("ALTER TABLE prospects RENAME COLUMN expedition_id TO search_id")
    op.execute("ALTER TABLE prospects DROP COLUMN rapport_version_id")
    _trigger(PROVENANCE_NEW)

    # 2 bis. Immutabilité d'un kit : le détachement `action_id = NULL` fait par la cascade de suppression reste permis.
    op.execute("DROP TRIGGER IF EXISTS trg_campaign_versions_immutable")
    op.execute(
        f"""
        CREATE TRIGGER trg_campaign_versions_immutable
        BEFORE UPDATE OF {CAMPAIGN_VERSION_CONTENT} ON campaign_versions
        BEGIN
            SELECT RAISE(ABORT, 'une version de kit de campagne est immuable');
        END
        """
    )

    # 3. Colonnes liées à l'ancien moteur (clés étrangères vers `mission_attempts` : recréation par lots).
    with op.batch_alter_table("action_runs") as batch:
        batch.drop_column("attempt_id")
    with op.batch_alter_table("reservations") as batch:
        batch.drop_column("attempt_id")
        batch.drop_column("quota")

    # 4. Tables retirées, enfants d'abord (les triggers `trg_submissions_frozen` et `trg_artifact_versions_immutable`
    #    disparaissent avec leurs tables).
    for table in (
        "evaluations",
        "submissions",
        "artifact_shares",
        "messages",
        "artifact_versions",
        "expedition_records",
        "mission_attempts",
        "mission_definitions",
    ):
        op.drop_table(table)

    # 5. Étape de campagne.
    op.execute("ALTER TABLE game_sessions DROP COLUMN stage")


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_campaign_versions_immutable")
    op.execute(
        """
        CREATE TRIGGER trg_campaign_versions_immutable
        BEFORE UPDATE ON campaign_versions
        BEGIN
            SELECT RAISE(ABORT, 'une version de kit de campagne est immuable');
        END
        """
    )
    op.execute("ALTER TABLE game_sessions ADD COLUMN stage VARCHAR NOT NULL DEFAULT 'm1'")

    op.create_table(
        "mission_definitions",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("version", sa.String(), nullable=False),
        sa.Column("mode", sa.String(), nullable=False),
        sa.Column("brief", sa.Text(), nullable=False),
        sa.Column("corpus", sa.JSON(), nullable=False),
        sa.Column("criteria", sa.JSON(), nullable=False),
        sa.Column("max_reward", sa.Integer(), nullable=False),
        sa.Column("unit_price", sa.Integer(), nullable=False),
        sa.Column("events", sa.JSON(), nullable=False),
        sa.Column("prerequisites", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id", "version", "mode", name="pk_mission_definitions"),
    )
    op.create_table(
        "mission_attempts",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("session_id", sa.String(), nullable=False),
        sa.Column("mission_id", sa.String(), nullable=False),
        sa.Column("brief_version", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("spend_cap", sa.Integer(), nullable=True),
        sa.Column("message_counts", sa.JSON(), nullable=False),
        sa.Column("clarifications_used", sa.Integer(), nullable=False),
        sa.Column("model_calls", sa.Integer(), nullable=False),
        sa.Column("attempt_no", sa.Integer(), nullable=False),
        sa.Column("unit_price", sa.Integer(), nullable=False),
        sa.Column("open_key_hash", sa.String(), nullable=True),
        sa.Column("profile_version", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["game_sessions.id"], name="fk_mission_attempts_session_id_game_sessions", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_mission_attempts"),
        sa.UniqueConstraint("session_id", "mission_id", "attempt_no", name="uq_mission_attempts_session_id_mission_id_attempt_no"),
    )
    op.create_index("ix_mission_attempts_session_id", "mission_attempts", ["session_id"])
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
        "artifact_versions",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("attempt_id", sa.String(), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("parent_id", sa.String(), nullable=True),
        sa.Column("author", sa.String(), nullable=False),
        sa.Column("sources", sa.JSON(), nullable=False),
        sa.Column("contributions", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["attempt_id"], ["mission_attempts.id"], name="fk_artifact_versions_attempt_id_mission_attempts", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["parent_id"], ["artifact_versions.id"], name="fk_artifact_versions_parent_id_artifact_versions", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_artifact_versions"),
    )
    op.create_index("ix_artifact_versions_attempt_id", "artifact_versions", ["attempt_id"])
    op.create_table(
        "messages",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("attempt_id", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("author", sa.String(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("linked_artifact_ids", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("action_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["action_id"], ["action_runs.id"], name="fk_messages_action_id_action_runs", ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["attempt_id"], ["mission_attempts.id"], name="fk_messages_attempt_id_mission_attempts", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_messages"),
    )
    op.create_index("ix_messages_attempt_id", "messages", ["attempt_id"])
    op.create_table(
        "artifact_shares",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("attempt_id", sa.String(), nullable=False),
        sa.Column("artifact_version_id", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("action_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["action_id"], ["action_runs.id"], name="fk_artifact_shares_action_id_action_runs", ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["artifact_version_id"], ["artifact_versions.id"], name="fk_artifact_shares_artifact_version_id_artifact_versions", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["attempt_id"], ["mission_attempts.id"], name="fk_artifact_shares_attempt_id_mission_attempts", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_artifact_shares"),
    )
    op.create_index("ix_artifact_shares_attempt_id", "artifact_shares", ["attempt_id"])
    op.create_table(
        "submissions",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("attempt_id", sa.String(), nullable=False),
        sa.Column("artifact_version_id", sa.String(), nullable=False),
        sa.Column("brief_version", sa.Integer(), nullable=False),
        sa.Column("content_hash", sa.String(), nullable=False),
        sa.Column("rubric", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["artifact_version_id"], ["artifact_versions.id"], name="fk_submissions_artifact_version_id_artifact_versions", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["attempt_id"], ["mission_attempts.id"], name="fk_submissions_attempt_id_mission_attempts", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_submissions"),
    )
    op.create_index("ix_submissions_attempt_id", "submissions", ["attempt_id"])
    op.create_table(
        "evaluations",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("submission_id", sa.String(), nullable=False),
        sa.Column("model", sa.String(), nullable=False),
        sa.Column("judge_version", sa.String(), nullable=False),
        sa.Column("criteria", sa.JSON(), nullable=False),
        sa.Column("score", sa.Integer(), nullable=True),
        sa.Column("evidence", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("report", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["submission_id"], ["submissions.id"], name="fk_evaluations_submission_id_submissions", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_evaluations"),
        sa.UniqueConstraint("submission_id", name="uq_evaluations_submission_id"),
    )
    op.execute(
        """
        CREATE TRIGGER trg_artifact_versions_immutable
        BEFORE UPDATE ON artifact_versions
        BEGIN
            SELECT RAISE(ABORT, 'artifact_versions est immuable');
        END
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_submissions_frozen
        BEFORE UPDATE OF attempt_id, artifact_version_id, brief_version, content_hash, rubric ON submissions
        BEGIN
            SELECT RAISE(ABORT, 'une livraison figée ne peut pas être modifiée');
        END
        """
    )

    with op.batch_alter_table("reservations") as batch:
        batch.add_column(sa.Column("attempt_id", sa.String(), nullable=True))
        batch.add_column(sa.Column("quota", sa.Integer(), nullable=False, server_default="0"))
        batch.create_foreign_key("fk_reservations_attempt_id_mission_attempts", "mission_attempts", ["attempt_id"], ["id"], ondelete="CASCADE")
    with op.batch_alter_table("action_runs") as batch:
        batch.add_column(sa.Column("attempt_id", sa.String(), nullable=True))
        batch.create_foreign_key("fk_action_runs_attempt_id_mission_attempts", "mission_attempts", ["attempt_id"], ["id"], ondelete="CASCADE")

    op.execute("DROP TRIGGER IF EXISTS trg_prospects_provenance_immutable")
    op.execute("ALTER TABLE prospects ADD COLUMN rapport_version_id VARCHAR NOT NULL DEFAULT ''")
    op.execute("UPDATE prospects SET rapport_version_id = search_id")
    op.execute("ALTER TABLE prospects RENAME COLUMN search_id TO expedition_id")
    _trigger(PROVENANCE_OLD)
