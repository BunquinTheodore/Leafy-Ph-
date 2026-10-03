"""Public handbook queries. SQL only; a fixed number of queries per endpoint (no N+1)."""

from collections.abc import Sequence
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    Disease,
    DiseaseAffectedSpecies,
    DiseaseEntry,
    DiseaseImage,
    Plant,
)

_LIKE_ESCAPE = "\\"


def like_pattern(term: str) -> str:
    """Contains-match pattern with LIKE wildcards in the user's text escaped."""
    escaped = term.replace(_LIKE_ESCAPE, _LIKE_ESCAPE * 2).replace("%", r"\%").replace("_", r"\_")
    return f"%{escaped}%"


@dataclass(frozen=True)
class PlantWithCount:
    plant: Plant
    disease_count: int


@dataclass(frozen=True)
class DiseaseWithPlant:
    disease: Disease
    plant: Plant


@dataclass(frozen=True)
class DiseaseParts:
    entries: Sequence[DiseaseEntry]
    species: Sequence[str]
    images: Sequence[DiseaseImage]


class CatalogRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_plants(self, query: str | None) -> list[PlantWithCount]:
        count = (
            select(Disease.plant_id, func.count(Disease.id).label("disease_count"))
            .group_by(Disease.plant_id)
            .subquery()
        )
        statement = (
            select(Plant, func.coalesce(count.c.disease_count, 0))
            .outerjoin(count, count.c.plant_id == Plant.id)
            .order_by(Plant.common_name, Plant.id)
        )
        if query:
            pattern = like_pattern(query)
            statement = statement.where(
                Plant.common_name.ilike(pattern, escape=_LIKE_ESCAPE)
                | Plant.scientific_name.ilike(pattern, escape=_LIKE_ESCAPE)
            )
        result = await self._session.execute(statement)
        return [PlantWithCount(plant=row[0], disease_count=int(row[1])) for row in result.all()]

    async def get_plant(self, slug: str) -> Plant | None:
        result = await self._session.execute(select(Plant).where(Plant.slug == slug))
        return result.scalar_one_or_none()

    async def diseases_of_plant(self, plant_id: int) -> list[Disease]:
        result = await self._session.execute(
            select(Disease).where(Disease.plant_id == plant_id).order_by(Disease.name, Disease.id)
        )
        return list(result.scalars().all())

    async def list_diseases(
        self, *, query: str | None, plant_slug: str | None
    ) -> list[DiseaseWithPlant]:
        statement = (
            select(Disease, Plant)
            .join(Plant, Plant.id == Disease.plant_id)
            .order_by(Plant.common_name, Disease.name, Disease.id)
        )
        if plant_slug:
            statement = statement.where(Plant.slug == plant_slug)
        if query:
            pattern = like_pattern(query)
            statement = statement.where(
                Disease.name.ilike(pattern, escape=_LIKE_ESCAPE)
                | Disease.display_name.ilike(pattern, escape=_LIKE_ESCAPE)
            )
        result = await self._session.execute(statement)
        return [DiseaseWithPlant(disease=row[0], plant=row[1]) for row in result.all()]

    async def get_disease(self, plant_slug: str, disease_slug: str) -> DiseaseWithPlant | None:
        result = await self._session.execute(
            select(Disease, Plant)
            .join(Plant, Plant.id == Disease.plant_id)
            .where(Plant.slug == plant_slug, Disease.slug == disease_slug)
        )
        row = result.first()
        return DiseaseWithPlant(disease=row[0], plant=row[1]) if row else None

    async def disease_parts(self, disease_id: int) -> DiseaseParts:
        entries = await self._session.execute(
            select(DiseaseEntry)
            .where(DiseaseEntry.disease_id == disease_id)
            .order_by(DiseaseEntry.kind, DiseaseEntry.position)
        )
        species = await self._session.execute(
            select(DiseaseAffectedSpecies.species)
            .where(DiseaseAffectedSpecies.disease_id == disease_id)
            .order_by(DiseaseAffectedSpecies.id)
        )
        images = await self._session.execute(
            select(DiseaseImage)
            .where(DiseaseImage.disease_id == disease_id)
            .order_by(DiseaseImage.position, DiseaseImage.id)
        )
        return DiseaseParts(
            entries=list(entries.scalars().all()),
            species=list(species.scalars().all()),
            images=list(images.scalars().all()),
        )
