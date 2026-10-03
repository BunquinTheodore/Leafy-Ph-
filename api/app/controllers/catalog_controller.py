"""Catalog controller: normalizes query text and calls the read service."""

import re

from app.schemas.catalog import DiseaseDetailOut, DiseaseListOut, PlantDetailOut, PlantListOut
from app.services.catalog_service import CatalogService

MAX_QUERY_LENGTH = 100
_WHITESPACE = re.compile(r"\s+")


def normalize_query(raw: str | None) -> str | None:
    """Trim and collapse whitespace; blank input means no filter."""
    if raw is None:
        return None
    cleaned = _WHITESPACE.sub(" ", raw).strip()
    return cleaned[:MAX_QUERY_LENGTH] or None


class CatalogController:
    def __init__(self, service: CatalogService) -> None:
        self._service = service

    async def plants(self, q: str | None) -> PlantListOut:
        return await self._service.list_plants(normalize_query(q))

    async def plant(self, slug: str) -> PlantDetailOut:
        return await self._service.plant_detail(slug)

    async def diseases(self, q: str | None, plant: str | None) -> DiseaseListOut:
        return await self._service.list_diseases(normalize_query(q), plant or None)

    async def disease(self, plant: str, disease: str) -> DiseaseDetailOut:
        return await self._service.disease_detail(plant, disease)
