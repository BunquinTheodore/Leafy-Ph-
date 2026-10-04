import enum
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    Text,
    desc,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def _enum_values(enum_cls: type[enum.StrEnum]) -> list[str]:
    return [member.value for member in enum_cls]


class ScanStatus(enum.StrEnum):
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class ScanStage(enum.StrEnum):
    VALIDATING = "validating"
    ANALYZING = "analyzing"
    SAVING = "saving"


class ScanVerdict(enum.StrEnum):
    DISEASE = "disease"
    HEALTHY = "healthy"
    UNKNOWN = "unknown"


_STATE_CHECK = (
    "(status = 'processing' AND stage IS NOT NULL AND verdict IS NULL AND failure_code IS NULL)"
    " OR (status = 'completed' AND stage IS NULL AND verdict IS NOT NULL AND failure_code IS NULL)"
    " OR (status = 'failed' AND stage IS NULL AND verdict IS NULL AND failure_code IS NOT NULL)"
)
_VERDICT_CHECK = (
    "verdict IS NULL"
    " OR (verdict = 'disease' AND plant_id IS NOT NULL AND disease_id IS NOT NULL)"
    " OR (verdict = 'healthy' AND plant_id IS NOT NULL AND disease_id IS NULL)"
    " OR (verdict = 'unknown' AND disease_id IS NULL)"
)


class Scan(Base):
    __tablename__ = "scan"
    __table_args__ = (
        ForeignKeyConstraint(["plant_id"], ["plant.id"], ondelete="RESTRICT"),
        # MATCH SIMPLE: skipped while disease_id is NULL, enforced once a disease is set.
        ForeignKeyConstraint(
            ["disease_id", "plant_id"],
            ["disease.id", "disease.plant_id"],
            name="fk_scan_disease_plant",
            ondelete="RESTRICT",
        ),
        CheckConstraint(_STATE_CHECK, name="state_consistent"),
        CheckConstraint(_VERDICT_CHECK, name="verdict_consistent"),
        CheckConstraint("disease_id IS NULL OR plant_id IS NOT NULL", name="disease_needs_plant"),
        Index("ix_scan_user_created_id", "user_id", desc("created_at"), desc("id")),
        Index("ix_scan_status_updated_at", "status", "updated_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    image_key: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    status: Mapped[ScanStatus] = mapped_column(
        Enum(ScanStatus, name="scan_status", values_callable=_enum_values), nullable=False
    )
    stage: Mapped[ScanStage | None] = mapped_column(
        Enum(ScanStage, name="scan_stage", values_callable=_enum_values)
    )
    failure_code: Mapped[str | None] = mapped_column(String(40))
    # Run identity: bumped on every retry so a stale worker can never touch a newer run.
    attempt: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    verdict: Mapped[ScanVerdict | None] = mapped_column(
        Enum(ScanVerdict, name="scan_verdict", values_callable=_enum_values)
    )
    plant_id: Mapped[int | None] = mapped_column()
    disease_id: Mapped[int | None] = mapped_column()
    confidence: Mapped[str | None] = mapped_column(String(20))
    raw_prediction: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class ScanFeedback(Base):
    __tablename__ = "scan_feedback"
    __table_args__ = (CheckConstraint("char_length(comment) <= 300", name="comment_length"),)

    scan_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("scan.id", ondelete="CASCADE"), primary_key=True
    )
    is_correct: Mapped[bool] = mapped_column(Boolean, nullable=False)
    correct_plant_slug: Mapped[str | None] = mapped_column(String(80))
    correct_disease_slug: Mapped[str | None] = mapped_column(String(120))
    comment: Mapped[str | None] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
