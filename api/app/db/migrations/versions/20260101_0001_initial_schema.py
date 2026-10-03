"""Initial schema: users, tokens, catalog, scans, feedback, storage outbox.

Revision ID: 0001
Revises:
Create Date: 2026-01-01
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ENUMS: dict[str, tuple[str, ...]] = {
    "oauth_provider": ("google",),
    "auth_token_type": ("verify_email", "reset_password"),
    "pathogen_type": ("fungus", "bacterium", "virus", "oomycete", "pest", "other"),
    "entry_kind": ("symptom", "treatment", "prevention"),
    "scan_status": ("processing", "completed", "failed"),
    "scan_stage": ("validating", "analyzing", "saving"),
    "scan_verdict": ("disease", "healthy", "unknown"),
}

NOW = sa.text("now()")

STATE_CHECK = (
    "(status = 'processing' AND stage IS NOT NULL AND verdict IS NULL AND failure_code IS NULL)"
    " OR (status = 'completed' AND stage IS NULL AND verdict IS NOT NULL AND failure_code IS NULL)"
    " OR (status = 'failed' AND stage IS NULL AND verdict IS NULL AND failure_code IS NOT NULL)"
)
VERDICT_CHECK = (
    "verdict IS NULL"
    " OR (verdict = 'disease' AND plant_id IS NOT NULL AND disease_id IS NOT NULL)"
    " OR (verdict = 'healthy' AND plant_id IS NOT NULL AND disease_id IS NULL)"
    " OR (verdict = 'unknown' AND disease_id IS NULL)"
)


def _enum(name: str) -> pg.ENUM:
    return pg.ENUM(*ENUMS[name], name=name, create_type=False)


def _uuid_pk() -> sa.Column[object]:
    return sa.Column("id", pg.UUID(as_uuid=True), primary_key=True)


def _timestamp(name: str, *, nullable: bool = False, default_now: bool = False) -> sa.Column[object]:
    return sa.Column(
        name,
        sa.DateTime(timezone=True),
        nullable=nullable,
        server_default=NOW if default_now else None,
    )


def upgrade() -> None:
    bind = op.get_bind()
    op.execute("CREATE EXTENSION IF NOT EXISTS citext")
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    for name, values in ENUMS.items():
        pg.ENUM(*values, name=name).create(bind, checkfirst=True)

    _create_user_tables()
    _create_catalog_tables()
    _create_scan_tables()


def _create_user_tables() -> None:
    op.create_table(
        "users",
        _uuid_pk(),
        sa.Column("email", pg.CITEXT(), nullable=False, unique=True),
        sa.Column("password_hash", sa.Text()),
        sa.Column("first_name", sa.String(100), nullable=False),
        sa.Column("last_name", sa.String(100), nullable=False),
        _timestamp("email_verified_at", nullable=True),
        _timestamp("password_changed_at", nullable=True),
        _timestamp("created_at", default_now=True),
        _timestamp("updated_at", default_now=True),
    )
    op.create_table(
        "oauth_identity",
        _uuid_pk(),
        sa.Column("user_id", pg.UUID(as_uuid=True), nullable=False),
        sa.Column("provider", _enum("oauth_provider"), nullable=False),
        sa.Column("provider_sub", sa.String(255), nullable=False),
        sa.Column("email", pg.CITEXT(), nullable=False),
        _timestamp("created_at", default_now=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("provider", "provider_sub"),
    )
    op.create_index("ix_oauth_identity_user_id", "oauth_identity", ["user_id"])

    op.create_table(
        "refresh_token",
        _uuid_pk(),
        sa.Column("user_id", pg.UUID(as_uuid=True), nullable=False),
        sa.Column("family_id", pg.UUID(as_uuid=True), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        _timestamp("created_at"),
        _timestamp("expires_at"),
        _timestamp("family_expires_at"),
        _timestamp("rotated_at", nullable=True),
        sa.Column("replaced_by", pg.UUID(as_uuid=True)),
        _timestamp("revoked_at", nullable=True),
        sa.Column("revoked_reason", sa.String(40)),
        sa.Column("ip", sa.String(64)),
        sa.Column("user_agent", sa.String(300)),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["replaced_by"], ["refresh_token.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_refresh_token_user_id", "refresh_token", ["user_id"])
    op.create_index("ix_refresh_token_family_id", "refresh_token", ["family_id"])

    op.create_table(
        "auth_token",
        _uuid_pk(),
        sa.Column("user_id", pg.UUID(as_uuid=True), nullable=False),
        sa.Column("type", _enum("auth_token_type"), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        _timestamp("created_at", default_now=True),
        _timestamp("expires_at"),
        _timestamp("used_at", nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_auth_token_user_id", "auth_token", ["user_id"])

    op.create_table(
        "storage_deletion",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("bucket", sa.String(100), nullable=False),
        sa.Column("object_key", sa.Text(), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error", sa.String(300)),
        _timestamp("created_at", default_now=True),
        _timestamp("next_attempt_at", default_now=True),
    )


def _create_catalog_tables() -> None:
    op.create_table(
        "plant",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("slug", sa.String(80), nullable=False, unique=True),
        sa.Column("common_name", sa.String(100), nullable=False),
        sa.Column("scientific_name", sa.Text()),
        sa.Column("family", sa.String(100)),
        sa.Column("plant_type", sa.String(60)),
        sa.Column("soil_type", sa.Text()),
        sa.Column("light", sa.Text()),
        sa.Column("water_needs", sa.Text()),
        sa.Column("temperature", sa.Text()),
        sa.Column("image_key", sa.Text()),
        sa.Column("image_alt", sa.Text()),
    )
    op.create_index(
        "ix_plant_common_name_trgm",
        "plant",
        ["common_name"],
        postgresql_using="gin",
        postgresql_ops={"common_name": "gin_trgm_ops"},
    )
    op.create_table(
        "disease",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("plant_id", sa.Integer(), nullable=False),
        sa.Column("slug", sa.String(120), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("display_name", sa.String(60)),
        sa.Column("cause", sa.Text()),
        sa.Column("pathogen_type", _enum("pathogen_type")),
        sa.Column("pathogen_name", sa.Text()),
        sa.Column("severity", sa.Text()),
        sa.ForeignKeyConstraint(["plant_id"], ["plant.id"], ondelete="RESTRICT"),
        sa.UniqueConstraint("plant_id", "slug"),
        sa.UniqueConstraint("id", "plant_id", name="uq_disease_id_plant_id"),
    )
    op.create_index("ix_disease_plant_id", "disease", ["plant_id"])
    op.create_index(
        "ix_disease_name_trgm",
        "disease",
        ["name"],
        postgresql_using="gin",
        postgresql_ops={"name": "gin_trgm_ops"},
    )
    op.create_table(
        "disease_entry",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("disease_id", sa.Integer(), nullable=False),
        sa.Column("kind", _enum("entry_kind"), nullable=False),
        sa.Column("position", sa.SmallInteger(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(["disease_id"], ["disease.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("disease_id", "kind", "position"),
        sa.CheckConstraint("position >= 0", name="position_nonnegative"),
    )
    op.create_index("ix_disease_entry_disease_id", "disease_entry", ["disease_id"])
    op.create_table(
        "disease_affected_species",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("disease_id", sa.Integer(), nullable=False),
        sa.Column("species", sa.String(150), nullable=False),
        sa.ForeignKeyConstraint(["disease_id"], ["disease.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("disease_id", "species"),
    )
    op.create_index(
        "ix_disease_affected_species_disease_id", "disease_affected_species", ["disease_id"]
    )
    op.create_table(
        "disease_image",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("disease_id", sa.Integer(), nullable=False),
        sa.Column("storage_key", sa.Text(), nullable=False),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("alt_text", sa.Text()),
        sa.Column("position", sa.SmallInteger(), nullable=False),
        sa.ForeignKeyConstraint(["disease_id"], ["disease.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("disease_id", "sha256"),
    )
    op.create_index("ix_disease_image_disease_id", "disease_image", ["disease_id"])


def _create_scan_tables() -> None:
    op.create_table(
        "scan",
        _uuid_pk(),
        sa.Column("user_id", pg.UUID(as_uuid=True), nullable=False),
        sa.Column("image_key", sa.Text(), nullable=False, unique=True),
        sa.Column("status", _enum("scan_status"), nullable=False),
        sa.Column("stage", _enum("scan_stage")),
        sa.Column("failure_code", sa.String(40)),
        sa.Column("verdict", _enum("scan_verdict")),
        sa.Column("plant_id", sa.Integer()),
        sa.Column("disease_id", sa.Integer()),
        sa.Column("confidence", sa.String(20)),
        sa.Column("raw_prediction", pg.JSONB()),
        _timestamp("created_at", default_now=True),
        _timestamp("updated_at", default_now=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["plant_id"], ["plant.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["disease_id", "plant_id"],
            ["disease.id", "disease.plant_id"],
            name="fk_scan_disease_plant",
            ondelete="RESTRICT",
        ),
        sa.CheckConstraint(STATE_CHECK, name="state_consistent"),
        sa.CheckConstraint(VERDICT_CHECK, name="verdict_consistent"),
        sa.CheckConstraint("disease_id IS NULL OR plant_id IS NOT NULL", name="disease_needs_plant"),
    )
    op.create_index(
        "ix_scan_user_created_id",
        "scan",
        ["user_id", sa.text("created_at DESC"), sa.text("id DESC")],
    )
    op.create_index("ix_scan_status_updated_at", "scan", ["status", "updated_at"])
    op.create_table(
        "scan_feedback",
        sa.Column("scan_id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column("is_correct", sa.Boolean(), nullable=False),
        sa.Column("correct_plant_slug", sa.String(80)),
        sa.Column("correct_disease_slug", sa.String(120)),
        sa.Column("comment", sa.String(300)),
        _timestamp("created_at", default_now=True),
        _timestamp("updated_at", default_now=True),
        sa.ForeignKeyConstraint(["scan_id"], ["scan.id"], ondelete="CASCADE"),
        sa.CheckConstraint("char_length(comment) <= 300", name="comment_length"),
    )


def downgrade() -> None:
    for table in (
        "scan_feedback",
        "scan",
        "disease_image",
        "disease_affected_species",
        "disease_entry",
        "disease",
        "plant",
        "storage_deletion",
        "auth_token",
        "refresh_token",
        "oauth_identity",
        "users",
    ):
        op.drop_table(table)
    bind = op.get_bind()
    for name in ENUMS:
        pg.ENUM(name=name).drop(bind, checkfirst=True)
    # citext and pg_trgm stay installed: other schemas may rely on them.
