"""hangar à 4 rôles (API-R1) et compteurs de quota par cible

Revision ID: 0006
Revises: 0005

- `target_action_uses` : quota de générations par `(session, kind, target_id, key)` ; unique, jamais plus de 5
  (le plafond vient de `rules_v2`, la contrainte `used + reserved >= 0` protège seulement la cohérence).
- Rôles retirés : `qualifier`, `profiler`, `outreach` (cap du 2026-11-07, 5e décision). Ils n'ont jamais été
  achetables par l'API ; toute ligne éventuelle (base de démo) est supprimée avec ses seules écritures d'achat
  correspondantes remboursées (écriture de ledger positive `refund`), pour ne rien faire perdre au joueur.
  Aucun rôle n'est remappé : les actions de `profiler`/`outreach` sont désormais portées par `replier`, à racheter.
"""
from uuid import uuid4

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None

REMOVED = ("qualifier", "profiler", "outreach")


def upgrade() -> None:
    op.create_table(
        "target_action_uses",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("session_id", sa.String(), nullable=False),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("target_id", sa.String(), nullable=False),
        sa.Column("key", sa.String(), nullable=False),
        sa.Column("used", sa.Integer(), nullable=False),
        sa.Column("reserved", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["game_sessions.id"], name="fk_target_action_uses_session_id_game_sessions", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_target_action_uses"),
        sa.UniqueConstraint("session_id", "kind", "target_id", "key", name="uq_target_action_uses_session_id_kind_target_id_key"),
        sa.CheckConstraint("used >= 0 AND reserved >= 0", name="ck_target_action_uses_non_negative"),
    )
    bind = op.get_bind()
    rows = bind.execute(
        sa.text("SELECT id, session_id, role, price_paid FROM agent_ownerships WHERE role IN ('qualifier','profiler','outreach')")
    ).fetchall()
    for _id, sid, role, price in rows:
        if price and price > 0:
            bind.execute(
                sa.text(
                    "INSERT INTO ledger_entries (id, session_id, amount, category, source_action, state, created_at) "
                    "VALUES (:id, :sid, :amt, 'refund', :src, 'POSTED', CURRENT_TIMESTAMP)"
                ),
                {"id": f"led_{uuid4().hex[:16]}", "sid": sid, "amt": price, "src": f"migration0006:{sid}:{role}"},
            )
    bind.execute(sa.text("DELETE FROM agent_ownerships WHERE role IN ('qualifier','profiler','outreach')"))


def downgrade() -> None:
    op.drop_table("target_action_uses")
