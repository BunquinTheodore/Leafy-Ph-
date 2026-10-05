"""Drop auth_token (email links are gone) and record how each session was started.

refresh_token gains auth_method ('password' or 'google') and auth_at, the moment the user last
proved themselves with that method. A recent Google sign in may set a new password without the
old one, which is the recovery path now that no email is sent.

Revision ID: 0004
Revises: 0003
Create Date: 2026-01-04
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

AUTH_TOKEN_TYPES = ("verify_email", "reset_password")


def upgrade() -> None:
    op.drop_index("ix_auth_token_user_id", table_name="auth_token")
    op.drop_table("auth_token")
    pg.ENUM(name="auth_token_type").drop(op.get_bind(), checkfirst=True)
    op.add_column(
        "refresh_token",
        sa.Column("auth_method", sa.String(20), server_default="password", nullable=False),
    )
    op.add_column("refresh_token", sa.Column("auth_at", sa.DateTime(timezone=True)))


def downgrade() -> None:
    op.drop_column("refresh_token", "auth_at")
    op.drop_column("refresh_token", "auth_method")
    token_type = pg.ENUM(*AUTH_TOKEN_TYPES, name="auth_token_type", create_type=False)
    token_type.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "auth_token",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", pg.UUID(as_uuid=True), nullable=False),
        sa.Column("type", token_type, nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True)),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_auth_token_user_id", "auth_token", ["user_id"])
