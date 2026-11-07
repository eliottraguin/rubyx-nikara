"""messagerie simulée : conversations, messages, brouillons de réponse, synthèses (API-N1)

Revision ID: 0009_conversations
Revises: 0008_campaigns

- `conversations` : une par `(session, prospect)` (unique) ; suppression en cascade avec la partie. `prospect_id` n'a pas
  de clé étrangère tant que le carnet (`prospects`, migration `0006_prospects` d'une autre branche) n'est pas fusionné.
- `conversation_messages` : fil (`sens` envoye|recu, `etat` ENVOYE|NON_ENVOYE), cascade avec la conversation.
- `reply_drafts` et `conversation_syntheses` : versions **immuables** (trigger : aucun UPDATE), cascade avec la conversation.

RACCORD À LA FUSION : l'ordre prévu est carnet (`0006_prospects`), messagerie (cette migration), pub. Ici
`down_revision = "0006"` (hangar, tête réelle de cette branche) ; à la fusion, le remplacer par `"0006_prospects"`.
"""
import sqlalchemy as sa
from alembic import op

revision = "0009_conversations"
down_revision = "0008_campaigns"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "conversations",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("session_id", sa.String(), nullable=False),
        sa.Column("prospect_id", sa.String(), nullable=False),
        sa.Column("simule", sa.Boolean(), nullable=False),
        sa.Column("persona_id", sa.String(), nullable=True),
        sa.Column("client_turns", sa.Integer(), nullable=False),
        sa.Column("opted_out", sa.Boolean(), nullable=False),
        sa.Column("closed", sa.Boolean(), nullable=False),
        sa.Column("outcome", sa.JSON(), nullable=True),
        sa.Column("last_message_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["game_sessions.id"], name="fk_conversations_session_id_game_sessions", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_conversations"),
        sa.UniqueConstraint("session_id", "prospect_id", name="uq_conversations_session_id_prospect_id"),
    )
    op.create_index("ix_conversations_session_id", "conversations", ["session_id"])
    op.create_table(
        "conversation_messages",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("conversation_id", sa.String(), nullable=False),
        sa.Column("seq", sa.Integer(), nullable=False),
        sa.Column("sens", sa.String(), nullable=False),
        sa.Column("etat", sa.String(), nullable=True),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("simule", sa.Boolean(), nullable=False),
        sa.Column("draft_version_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"], name="fk_conversation_messages_conversation_id_conversations", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_conversation_messages"),
        sa.UniqueConstraint("conversation_id", "seq", name="uq_conversation_messages_conversation_id_seq"),
    )
    op.create_table(
        "reply_drafts",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("conversation_id", sa.String(), nullable=False),
        sa.Column("parent_id", sa.String(), nullable=True),
        sa.Column("auteur", sa.String(), nullable=False),
        sa.Column("objet", sa.String(), nullable=True),
        sa.Column("corps", sa.Text(), nullable=False),
        sa.Column("a_verifier", sa.JSON(), nullable=False),
        sa.Column("controles", sa.JSON(), nullable=False),
        sa.Column("action_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"], name="fk_reply_drafts_conversation_id_conversations", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["parent_id"], ["reply_drafts.id"], name="fk_reply_drafts_parent_id_reply_drafts", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_reply_drafts"),
    )
    op.create_index("ix_reply_drafts_conversation_id", "reply_drafts", ["conversation_id"])
    op.create_table(
        "conversation_syntheses",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("conversation_id", sa.String(), nullable=False),
        sa.Column("intention", sa.String(), nullable=False),
        sa.Column("points", sa.JSON(), nullable=False),
        sa.Column("urgence", sa.String(), nullable=False),
        sa.Column("statut_suggere", sa.String(), nullable=True),
        sa.Column("desinscription_code", sa.Boolean(), nullable=False),
        sa.Column("controles", sa.JSON(), nullable=False),
        sa.Column("action_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"], name="fk_conversation_syntheses_conversation_id_conversations", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_conversation_syntheses"),
    )
    op.create_index("ix_conversation_syntheses_conversation_id", "conversation_syntheses", ["conversation_id"])
    # Versions immuables (invariant 1 de DATA-MODEL.md) : la base refuse toute modification.
    for table in ("reply_drafts", "conversation_syntheses"):
        op.execute(
            f"""
            CREATE TRIGGER trg_{table}_immutable
            BEFORE UPDATE ON {table}
            BEGIN
                SELECT RAISE(ABORT, '{table} est immuable');
            END
            """
        )


def downgrade() -> None:
    for table in ("conversation_syntheses", "reply_drafts"):
        op.execute(f"DROP TRIGGER IF EXISTS trg_{table}_immutable")
    op.drop_index("ix_conversation_syntheses_conversation_id", table_name="conversation_syntheses")
    op.drop_table("conversation_syntheses")
    op.drop_index("ix_reply_drafts_conversation_id", table_name="reply_drafts")
    op.drop_table("reply_drafts")
    op.drop_table("conversation_messages")
    op.drop_index("ix_conversations_session_id", table_name="conversations")
    op.drop_table("conversations")
