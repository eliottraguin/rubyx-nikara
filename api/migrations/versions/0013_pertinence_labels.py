"""étiquettes de pertinence des prospects (API-S2)

Revision ID: 0013_pertinence_labels
Revises: 0012_searches

- `prospects.pertinence_etiquette` : `correspond | a_verifier | hors_cible` (null = jamais triée, lue « à vérifier ») ;
- `prospects.pertinence_citation` : extrait littéral de la source (vérifié par le serveur) ;
- `prospects.pertinence_champ` : champ de la source dont l'extrait est tiré.
Additive et réversible ; l'entier `pertinence` existant n'est pas modifié.
"""
import sqlalchemy as sa
from alembic import op

revision = "0013_pertinence_labels"
down_revision = "0012_searches"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("prospects") as batch:
        batch.add_column(sa.Column("pertinence_etiquette", sa.String(), nullable=True))
        batch.add_column(sa.Column("pertinence_citation", sa.String(), nullable=True))
        batch.add_column(sa.Column("pertinence_champ", sa.String(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("prospects") as batch:
        batch.drop_column("pertinence_champ")
        batch.drop_column("pertinence_citation")
        batch.drop_column("pertinence_etiquette")
