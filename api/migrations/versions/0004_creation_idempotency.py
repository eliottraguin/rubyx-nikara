"""idempotence de la création de partie et de la reprise de mission

Revision ID: 0004
Revises: 0003

- `game_sessions.creation_key_hash` (unique) et `creation_request_hash` : empreintes de l'Idempotency-Key et de la
  requête de création. Même clé + même requête = même partie (aucune 2e partie) ; même clé + autre requête = refus.
- `mission_attempts.open_key_hash` : empreinte de l'Idempotency-Key qui a ouvert la tentative (rejeu de `retry`).
Aucune clé en clair n'est stockée.
"""
import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("game_sessions", schema=None) as batch_op:
        batch_op.add_column(sa.Column("creation_key_hash", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("creation_request_hash", sa.String(), nullable=True))
        batch_op.create_unique_constraint("uq_game_sessions_creation_key_hash", ["creation_key_hash"])
    with op.batch_alter_table("mission_attempts", schema=None) as batch_op:
        batch_op.add_column(sa.Column("open_key_hash", sa.String(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("mission_attempts", schema=None) as batch_op:
        batch_op.drop_column("open_key_hash")
    with op.batch_alter_table("game_sessions", schema=None) as batch_op:
        batch_op.drop_constraint("uq_game_sessions_creation_key_hash", type_="unique")
        batch_op.drop_column("creation_request_hash")
        batch_op.drop_column("creation_key_hash")
