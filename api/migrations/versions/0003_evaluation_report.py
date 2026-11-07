"""rapport d'évaluation serveur (BE06)

Revision ID: 0003
Revises: 0002

- `evaluations.report` (JSON, nullable) : retour client, réussite, paiement, plafond essentiel — calculés par le serveur.
"""
import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("evaluations", schema=None) as batch_op:
        batch_op.add_column(sa.Column("report", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("evaluations", schema=None) as batch_op:
        batch_op.drop_column("report")
