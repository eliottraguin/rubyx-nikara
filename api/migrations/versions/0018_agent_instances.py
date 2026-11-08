"""instances d'agent en plusieurs exemplaires, paliers et configurations versionnées (docs/CONTRACTS-V2.md §2, ticket C2)

Revision ID: 0018_agent_instances
Revises: 0017_user_token

- `agent_instances` : un exemplaire acheté d'un métier (`scout`/`triage`/`replier`/`ads`), son palier, son statut
  (idle|busy|traveling|disabled) et sa configuration active courante.
- `agent_configs` : versions **immuables** (trigger : aucun UPDATE, comme `prospect_drafts`) des instructions et du
  contexte d'une instance ; la version 1 est créée automatiquement à l'achat.
`agent_instances.active_config_id` n'a pas de contrainte de clé étrangère créée avec la table (cycle avec
`agent_configs`, qui référence `instance_id`) : elle est ajoutée après coup par `batch_alter_table`.
Additive et réversible.
"""
import sqlalchemy as sa
from alembic import op

revision = "0018_agent_instances"
down_revision = "0017_user_token"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "agent_instances",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("session_id", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("tier", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("label", sa.String(), nullable=True),
        sa.Column("active_config_id", sa.String(), nullable=True),
        sa.Column("price_paid", sa.Integer(), nullable=False),
        sa.Column("purchased_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["game_sessions.id"], name="fk_agent_instances_session_id_game_sessions", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_agent_instances"),
    )
    op.create_index("ix_agent_instances_session_id", "agent_instances", ["session_id"])

    op.create_table(
        "agent_configs",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("instance_id", sa.String(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("parent_id", sa.String(), nullable=True),
        sa.Column("instructions", sa.Text(), nullable=False),
        sa.Column("context_note", sa.Text(), nullable=True),
        sa.Column("tools", sa.JSON(), nullable=False),
        sa.Column("tier_cap", sa.Integer(), nullable=False),
        sa.Column("price_paid", sa.Integer(), nullable=False),
        sa.Column("created_by", sa.String(), nullable=False),
        sa.Column("action_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["instance_id"], ["agent_instances.id"], name="fk_agent_configs_instance_id_agent_instances", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["parent_id"], ["agent_configs.id"], name="fk_agent_configs_parent_id_agent_configs", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_agent_configs"),
        sa.UniqueConstraint("instance_id", "version", name="uq_agent_configs_instance_id_version"),
    )
    op.create_index("ix_agent_configs_instance_id", "agent_configs", ["instance_id"])

    with op.batch_alter_table("agent_instances") as batch:
        batch.create_foreign_key(
            "fk_agent_instances_active_config_id_agent_configs", "agent_configs", ["active_config_id"], ["id"], ondelete="SET NULL"
        )

    # Versions immuables (invariant 1 de DATA-MODEL.md) : la base refuse toute modification.
    op.execute(
        """
        CREATE TRIGGER trg_agent_configs_immutable
        BEFORE UPDATE ON agent_configs
        BEGIN
            SELECT RAISE(ABORT, 'agent_configs est immuable');
        END
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_agent_configs_immutable")
    with op.batch_alter_table("agent_instances") as batch:
        batch.drop_constraint("fk_agent_instances_active_config_id_agent_configs", type_="foreignkey")
    op.drop_index("ix_agent_configs_instance_id", table_name="agent_configs")
    op.drop_table("agent_configs")
    op.drop_index("ix_agent_instances_session_id", table_name="agent_instances")
    op.drop_table("agent_instances")
