"""Scan DTOs: create, status, history, stats and result feedback."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.db.models import ScanStage, ScanStatus, ScanVerdict
from app.schemas.catalog import DiseaseDetailOut, PlantRefOut

MAX_COMMENT_LENGTH = 300
MAX_SLUG_LENGTH = 120


class ScanCreatedOut(BaseModel):
    id: uuid.UUID
    status: ScanStatus
    stage: ScanStage | None


class ScanDiseaseOut(BaseModel):
    slug: str
    name: str
    display_name: str
    severity: str | None


class ScanFeedbackOut(BaseModel):
    is_correct: bool
    correct_plant: str | None
    correct_disease: str | None
    comment: str | None
    updated_at: datetime


class ScanSummaryOut(BaseModel):
    id: uuid.UUID
    status: ScanStatus
    stage: ScanStage | None
    failure_code: str | None
    verdict: ScanVerdict | None
    confidence: str | None
    plant: PlantRefOut | None
    disease: ScanDiseaseOut | None
    image_url: str
    image_expires_at: datetime
    created_at: datetime
    updated_at: datetime


class ScanDetailOut(ScanSummaryOut):
    disease_detail: DiseaseDetailOut | None
    feedback: ScanFeedbackOut | None


class ScanListOut(BaseModel):
    items: list[ScanSummaryOut]
    next_cursor: str | None


class VerdictCountsOut(BaseModel):
    disease: int
    healthy: int
    unknown: int


class TopDiseaseOut(BaseModel):
    plant_slug: str
    plant_name: str
    disease_slug: str
    disease_name: str
    display_name: str
    count: int


class ScanStatsOut(BaseModel):
    total: int
    last_30_days: int
    by_verdict: VerdictCountsOut
    top_diseases: list[TopDiseaseOut]


class ScanDeletedOut(BaseModel):
    deleted: bool


class ScanFeedbackIn(BaseModel):
    is_correct: bool
    correct_plant: str | None = Field(default=None, max_length=MAX_SLUG_LENGTH)
    correct_disease: str | None = Field(default=None, max_length=MAX_SLUG_LENGTH)
    comment: str | None = Field(default=None, max_length=MAX_COMMENT_LENGTH + 200)

    @field_validator("correct_plant", "correct_disease", mode="before")
    @classmethod
    def _blank_slug_is_none(cls, value: object) -> object:
        if isinstance(value, str):
            cleaned = value.strip().lower()
            return cleaned or None
        return value

    @field_validator("comment", mode="after")
    @classmethod
    def _clean_comment(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if len(cleaned) > MAX_COMMENT_LENGTH:
            raise ValueError("comment is too long")
        return cleaned or None
