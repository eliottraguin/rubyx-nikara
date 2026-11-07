"""idempotence par session pour ActionRun (BE04)

Revision ID: 0002
Revises: 0001

- `action_runs.idempotency_key` n'est plus unique globalement : unicité `(session_id, idempotency_key)`.
- `request_hash` : empreinte de la requête (même clé + autre requête = refus).
- `confirm_keys` : clés des confirmations de plan déjà traitées (rejeu sans nouvel effet).
"""
import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("action_runs", schema=None) as batch_op:
        batch_op.drop_constraint("uq_action_runs_idempotency_key", type_="unique")
        batch_op.add_column(sa.Column("request_hash", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("confirm_keys", sa.JSON(), nullable=False, server_default="[]"))
        batch_op.create_unique_constraint("uq_action_runs_session_id_idempotency_key", ["session_id", "idempotency_key"])


def downgrade() -> None:
    with op.batch_alter_table("action_runs", schema=None) as batch_op:
        batch_op.drop_constraint("uq_action_runs_session_id_idempotency_key", type_="unique")
        batch_op.drop_column("confirm_keys")
        batch_op.drop_column("request_hash")
        batch_op.create_unique_constraint("uq_action_runs_idempotency_key", ["idempotency_key"])
