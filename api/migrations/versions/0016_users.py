"""comptes joueurs : `users`, `auth_attempts`, `game_sessions.user_id` (ADR 0001)

Revision ID: 0016_users
Revises: 0015_retire_expedition_engine

Les parties anonymes existantes sont conservées (`user_id` NULL) et restent rattachables à l'inscription.
Réversible : `downgrade` retire la colonne et les deux tables.
"""
import sqlalchemy as sa
from alembic import op

revision = "0016_users"
down_revision = "0015_retire_expedition_engine"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_users"),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )
    op.create_table(
        "auth_attempts",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("key_hash", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_auth_attempts"),
    )
    op.create_index("ix_auth_attempts_key_hash", "auth_attempts", ["key_hash"])
    with op.batch_alter_table("game_sessions") as batch:
        batch.add_column(sa.Column("user_id", sa.String(), nullable=True))
        batch.create_foreign_key("fk_game_sessions_user_id_users", "users", ["user_id"], ["id"], ondelete="SET NULL")
        batch.create_index("ix_game_sessions_user_id", ["user_id"])


def downgrade() -> None:
    with op.batch_alter_table("game_sessions") as batch:
        batch.drop_index("ix_game_sessions_user_id")
        batch.drop_constraint("fk_game_sessions_user_id_users", type_="foreignkey")
        batch.drop_column("user_id")
    op.drop_index("ix_auth_attempts_key_hash", table_name="auth_attempts")
    op.drop_table("auth_attempts")
    op.drop_table("users")
