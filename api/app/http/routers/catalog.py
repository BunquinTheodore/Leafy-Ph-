"""Public handbook endpoints. Cacheable: ETag plus Cache-Control, no authentication."""

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Request, Response

from app.controllers.catalog_controller import CatalogController
from app.core.envelope import Envelope, success_envelope
from app.http.caching import CATALOG_CACHE_CONTROL, cached_json
from app.http.deps import get_catalog_controller
from app.schemas.catalog import DiseaseDetailOut, DiseaseListOut, PlantDetailOut, PlantListOut

router = APIRouter(tags=["catalog"])

ControllerDep = Annotated[CatalogController, Depends(get_catalog_controller)]
SearchQuery = Annotated[str | None, Query(max_length=100)]
Slug = Annotated[str, Path(min_length=1, max_length=120)]


@router.get("/plants", response_model=Envelope[PlantListOut])
async def list_plants(
    request: Request, response: Response, controller: ControllerDep, q: SearchQuery = None
) -> Envelope[PlantListOut] | Response:
    envelope = success_envelope(await controller.plants(q))
    return cached_json(request, response, envelope, cache_control=CATALOG_CACHE_CONTROL)


@router.get("/plants/{plant}", response_model=Envelope[PlantDetailOut])
async def read_plant(
    plant: Slug, request: Request, response: Response, controller: ControllerDep
) -> Envelope[PlantDetailOut] | Response:
    envelope = success_envelope(await controller.plant(plant))
    return cached_json(request, response, envelope, cache_control=CATALOG_CACHE_CONTROL)


@router.get("/plants/{plant}/diseases/{disease}", response_model=Envelope[DiseaseDetailOut])
async def read_disease(
    plant: Slug, disease: Slug, request: Request, response: Response, controller: ControllerDep
) -> Envelope[DiseaseDetailOut] | Response:
    envelope = success_envelope(await controller.disease(plant, disease))
    return cached_json(request, response, envelope, cache_control=CATALOG_CACHE_CONTROL)


@router.get("/diseases", response_model=Envelope[DiseaseListOut])
async def list_diseases(
    request: Request,
    response: Response,
    controller: ControllerDep,
    q: SearchQuery = None,
    plant: Annotated[str | None, Query(max_length=80)] = None,
) -> Envelope[DiseaseListOut] | Response:
    envelope = success_envelope(await controller.diseases(q, plant))
    return cached_json(request, response, envelope, cache_control=CATALOG_CACHE_CONTROL)
