"""Handbook reads: maps catalog rows to DTOs. Public data, no user scoping."""

from collections.abc import Callable

from app.core.errors import AppError, ErrorCode
from app.db.models import Disease, EntryKind, Plant
from app.db.uow import UnitOfWork
from app.schemas.catalog import (
    DiseaseDetailOut,
    DiseaseImageOut,
    DiseaseListOut,
    DiseaseSummaryOut,
    PlantDetailOut,
    PlantListOut,
    PlantRefOut,
    PlantSummaryOut,
)

UrlBuilder = Callable[[str], str]


def disease_summary(disease: Disease, plant: Plant) -> DiseaseSummaryOut:
    return DiseaseSummaryOut(
        slug=disease.slug,
        plant_slug=plant.slug,
        plant_name=plant.common_name,
        name=disease.name,
        display_name=disease.display_name or disease.name,
        pathogen_type=disease.pathogen_type.value if disease.pathogen_type else None,
        severity=disease.severity,
    )


class CatalogService:
    def __init__(self, uow: UnitOfWork, public_url: UrlBuilder) -> None:
        self._uow = uow
        self._public_url = public_url

    def _plant_summary(self, plant: Plant, disease_count: int) -> PlantSummaryOut:
        return PlantSummaryOut(
            slug=plant.slug,
            name=plant.common_name,
            scientific_name=plant.scientific_name,
            family=plant.family,
            plant_type=plant.plant_type,
            image_url=self._public_url(plant.image_key) if plant.image_key else None,
            image_alt=plant.image_alt,
            disease_count=disease_count,
        )

    async def list_plants(self, query: str | None) -> PlantListOut:
        rows = await self._uow.catalog.list_plants(query)
        return PlantListOut(items=[self._plant_summary(r.plant, r.disease_count) for r in rows])

    async def plant_detail(self, slug: str) -> PlantDetailOut:
        plant = await self._uow.catalog.get_plant(slug)
        if plant is None:
            raise AppError(ErrorCode.NOT_FOUND)
        diseases = await self._uow.catalog.diseases_of_plant(plant.id)
        summary = self._plant_summary(plant, len(diseases))
        return PlantDetailOut(
            **summary.model_dump(),
            soil_type=plant.soil_type,
            light=plant.light,
            water_needs=plant.water_needs,
            temperature=plant.temperature,
            diseases=[disease_summary(d, plant) for d in diseases],
        )

    async def list_diseases(self, query: str | None, plant_slug: str | None) -> DiseaseListOut:
        rows = await self._uow.catalog.list_diseases(query=query, plant_slug=plant_slug)
        return DiseaseListOut(items=[disease_summary(r.disease, r.plant) for r in rows])

    async def disease_detail(self, plant_slug: str, disease_slug: str) -> DiseaseDetailOut:
        found = await self._uow.catalog.get_disease(plant_slug, disease_slug)
        if found is None:
            raise AppError(ErrorCode.NOT_FOUND)
        disease, plant = found.disease, found.plant
        parts = await self._uow.catalog.disease_parts(disease.id)
        by_kind: dict[EntryKind, list[str]] = {kind: [] for kind in EntryKind}
        for entry in parts.entries:
            by_kind[entry.kind].append(entry.text)
        return DiseaseDetailOut(
            slug=disease.slug,
            name=disease.name,
            display_name=disease.display_name or disease.name,
            plant=PlantRefOut(slug=plant.slug, name=plant.common_name),
            cause=disease.cause,
            pathogen_type=disease.pathogen_type.value if disease.pathogen_type else None,
            pathogen_name=disease.pathogen_name,
            severity=disease.severity,
            symptoms=by_kind[EntryKind.SYMPTOM],
            treatments=by_kind[EntryKind.TREATMENT],
            preventions=by_kind[EntryKind.PREVENTION],
            affected_species=list(parts.species),
            images=[
                DiseaseImageOut(url=self._public_url(image.storage_key), alt_text=image.alt_text)
                for image in parts.images
            ],
        )
