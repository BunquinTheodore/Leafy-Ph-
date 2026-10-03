"""Public handbook tables. Integer identity keys; slugs are the public identifiers."""

import enum

from sqlalchemy import (
    CheckConstraint,
    Enum,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def _enum_values(enum_cls: type[enum.StrEnum]) -> list[str]:
    return [member.value for member in enum_cls]


class PathogenType(enum.StrEnum):
    FUNGUS = "fungus"
    BACTERIUM = "bacterium"
    VIRUS = "virus"
    OOMYCETE = "oomycete"
    PEST = "pest"
    OTHER = "other"


class EntryKind(enum.StrEnum):
    SYMPTOM = "symptom"
    TREATMENT = "treatment"
    PREVENTION = "prevention"


class Plant(Base):
    __tablename__ = "plant"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    slug: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    common_name: Mapped[str] = mapped_column(String(100), nullable=False)
    scientific_name: Mapped[str | None] = mapped_column(Text)
    family: Mapped[str | None] = mapped_column(String(100))
    plant_type: Mapped[str | None] = mapped_column(String(60))
    soil_type: Mapped[str | None] = mapped_column(Text)
    light: Mapped[str | None] = mapped_column(Text)
    water_needs: Mapped[str | None] = mapped_column(Text)
    temperature: Mapped[str | None] = mapped_column(Text)
    image_key: Mapped[str | None] = mapped_column(Text)
    image_alt: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        Index(
            "ix_plant_common_name_trgm",
            "common_name",
            postgresql_using="gin",
            postgresql_ops={"common_name": "gin_trgm_ops"},
        ),
    )


class Disease(Base):
    __tablename__ = "disease"
    __table_args__ = (
        UniqueConstraint("plant_id", "slug"),
        # Target of scan's composite FK so a disease can never pair with the wrong plant.
        UniqueConstraint("id", "plant_id", name="uq_disease_id_plant_id"),
        Index(
            "ix_disease_name_trgm",
            "name",
            postgresql_using="gin",
            postgresql_ops={"name": "gin_trgm_ops"},
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    plant_id: Mapped[int] = mapped_column(
        ForeignKey("plant.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    slug: Mapped[str] = mapped_column(String(120), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(60))
    cause: Mapped[str | None] = mapped_column(Text)
    pathogen_type: Mapped[PathogenType | None] = mapped_column(
        Enum(PathogenType, name="pathogen_type", values_callable=_enum_values)
    )
    pathogen_name: Mapped[str | None] = mapped_column(Text)
    severity: Mapped[str | None] = mapped_column(Text)


class DiseaseEntry(Base):
    __tablename__ = "disease_entry"
    __table_args__ = (
        UniqueConstraint("disease_id", "kind", "position"),
        CheckConstraint("position >= 0", name="position_nonnegative"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    disease_id: Mapped[int] = mapped_column(
        ForeignKey("disease.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[EntryKind] = mapped_column(
        Enum(EntryKind, name="entry_kind", values_callable=_enum_values), nullable=False
    )
    position: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)


class DiseaseAffectedSpecies(Base):
    __tablename__ = "disease_affected_species"
    __table_args__ = (UniqueConstraint("disease_id", "species"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    disease_id: Mapped[int] = mapped_column(
        ForeignKey("disease.id", ondelete="CASCADE"), nullable=False, index=True
    )
    species: Mapped[str] = mapped_column(String(150), nullable=False)


class DiseaseImage(Base):
    __tablename__ = "disease_image"
    __table_args__ = (UniqueConstraint("disease_id", "sha256"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    disease_id: Mapped[int] = mapped_column(
        ForeignKey("disease.id", ondelete="CASCADE"), nullable=False, index=True
    )
    storage_key: Mapped[str] = mapped_column(Text, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    alt_text: Mapped[str | None] = mapped_column(Text)
    position: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
