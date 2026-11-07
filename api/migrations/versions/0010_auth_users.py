"""Email/password authentication: auth_users table (Epic 1)

Revision ID: 0010_auth_users
Revises: 0009_conversations

- `auth_users` : email/password accounts for login page. Email unique and indexed.
"""
import sqlalchemy as sa
from alembic import op

revision = "0010_auth_users"
down_revision = "0009_conversations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "auth_users",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_auth_users")),
        sa.UniqueConstraint("email", name=op.f("uq_auth_users_email")),
    )
    op.create_index(op.f("ix_auth_users_email"), "auth_users", ["email"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_auth_users_email"), table_name="auth_users")
    op.drop_table("auth_users")
