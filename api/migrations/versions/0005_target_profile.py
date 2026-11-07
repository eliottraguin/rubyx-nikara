"""fiche entreprise et cible versionnée (API-H1) et version de fiche figée par expédition (API-H2)

Revision ID: 0005
Revises: 0004

- `target_profile_versions` : une ligne **immuable** par version de la fiche (trigger : aucun UPDATE) ; unique
  `(session_id, version)` (deux écritures concurrentes ne créent pas la même version) ; `key_hash` et `request_hash`
  (empreintes, jamais la clé en clair) pour l'idempotence de `PUT /api/profile`. Suppression en cascade avec la partie.
- `mission_attempts.profile_version` : version de la fiche à l'ouverture de l'expédition (figée).
- Reprise des parties existantes : version 1 = nom de l'entreprise + ancien `company.profile` devenu `offre` ; les
  autres champs (dont `ton`) prennent leurs valeurs par défaut de `data/profile/target_profile_v1.json` à la lecture.
"""
import json

import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "target_profile_versions",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("session_id", sa.String(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("data", sa.JSON(), nullable=False),
        sa.Column("key_hash", sa.String(), nullable=True),
        sa.Column("request_hash", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["game_sessions.id"], name="fk_target_profile_versions_session_id_game_sessions", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_target_profile_versions"),
        sa.UniqueConstraint("session_id", "version", name="uq_target_profile_versions_session_id_version"),
        sa.UniqueConstraint("session_id", "key_hash", name="uq_target_profile_versions_session_id_key_hash"),
    )
    with op.batch_alter_table("mission_attempts", schema=None) as batch_op:
        batch_op.add_column(sa.Column("profile_version", sa.Integer(), nullable=True))

    bind = op.get_bind()
    rows = bind.execute(sa.text("SELECT id, company, created_at FROM game_sessions")).fetchall()
    for sid, company, created_at in rows:
        c = json.loads(company) if isinstance(company, str) else (company or {})
        data = {"entreprise_nom": c.get("name") or "", "offre": c.get("profile") or ""}
        bind.execute(
            sa.text(
                "INSERT INTO target_profile_versions (id, session_id, version, data, created_at) "
                "VALUES (:id, :sid, 1, :data, :ts)"
            ),
            {"id": f"tpv_{sid[4:]}", "sid": sid, "data": json.dumps(data, ensure_ascii=False), "ts": created_at},
        )
    bind.execute(sa.text("UPDATE mission_attempts SET profile_version = 1"))

    op.execute(
        """
        CREATE TRIGGER trg_target_profile_versions_immutable
        BEFORE UPDATE ON target_profile_versions
        BEGIN
            SELECT RAISE(ABORT, 'une version de fiche entreprise est immuable');
        END
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_target_profile_versions_immutable")
    with op.batch_alter_table("mission_attempts", schema=None) as batch_op:
        batch_op.drop_column("profile_version")
    op.drop_table("target_profile_versions")
