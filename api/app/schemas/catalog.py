"""Public handbook DTOs."""

from pydantic import BaseModel


class PlantRefOut(BaseModel):
    slug: str
    name: str


class DiseaseSummaryOut(BaseModel):
    slug: str
    plant_slug: str
    plant_name: str
    name: str
    display_name: str
    pathogen_type: str | None
    severity: str | None


class PlantSummaryOut(BaseModel):
    slug: str
    name: str
    scientific_name: str | None
    family: str | None
    plant_type: str | None
    image_url: str | None
    image_alt: str | None
    disease_count: int


class PlantDetailOut(PlantSummaryOut):
    soil_type: str | None
    light: str | None
    water_needs: str | None
    temperature: str | None
    diseases: list[DiseaseSummaryOut]


class DiseaseImageOut(BaseModel):
    url: str
    alt_text: str | None


class DiseaseDetailOut(BaseModel):
    slug: str
    name: str
    display_name: str
    plant: PlantRefOut
    cause: str | None
    pathogen_type: str | None
    pathogen_name: str | None
    severity: str | None
    symptoms: list[str]
    treatments: list[str]
    preventions: list[str]
    affected_species: list[str]
    images: list[DiseaseImageOut]


class PlantListOut(BaseModel):
    items: list[PlantSummaryOut]


class DiseaseListOut(BaseModel):
    items: list[DiseaseSummaryOut]
