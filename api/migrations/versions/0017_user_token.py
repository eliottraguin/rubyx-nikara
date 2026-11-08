"""jeton de compte opaque : `users.token_hash` (rattachement d'une partie créée après connexion)

Revision ID: 0017_user_token
Revises: 0016_users

Colonne nullable : NULL = compte déconnecté. Réversible.
"""
import sqlalchemy as sa
from alembic import op

revision = "0017_user_token"
down_revision = "0016_users"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("token_hash", sa.String(), nullable=True))
        batch.create_unique_constraint("uq_users_token_hash", ["token_hash"])


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_constraint("uq_users_token_hash", type_="unique")
        batch.drop_column("token_hash")
