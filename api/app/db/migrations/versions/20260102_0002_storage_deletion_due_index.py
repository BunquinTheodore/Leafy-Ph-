"""Index the storage outbox by due time so the drain job does not scan the table.

Revision ID: 0002
Revises: 0001
Create Date: 2026-01-02
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

INDEX_NAME = "ix_storage_deletion_next_attempt_at"


def upgrade() -> None:
    op.create_index(INDEX_NAME, "storage_deletion", ["next_attempt_at", "id"])


def downgrade() -> None:
    op.drop_index(INDEX_NAME, table_name="storage_deletion")
