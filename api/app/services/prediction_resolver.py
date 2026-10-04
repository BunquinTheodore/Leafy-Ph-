"""Turn the model's label mapping into catalog ids and a verdict. Never trusts the model."""

import math
import re
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Protocol

from app.db.models import Plant, ScanVerdict
from app.repositories.catalog_repository import DiseaseWithPlant

HEALTHY = "healthy"
UNKNOWN = "unknown"
MAX_CONFIDENCE_LENGTH = 20

PLANT_ALIASES: Mapping[str, str] = {
    "pepper-bell": "bell-pepper",
    "pepper": "bell-pepper",
    "peppers": "bell-pepper",
    "sweet-pepper": "bell-pepper",
    "capsicum": "bell-pepper",
    "maize": "corn",
    "corn-maize": "corn",
    "tomatoes": "tomato",
    "potatoes": "potato",
    "grapes": "grape",
    "cherry-including-sour": "cherry",
    "orange-citrus": "orange",
}
_NON_SLUG = re.compile(r"[^a-z0-9]+")


class CatalogLookup(Protocol):
    async def get_plant(self, slug: str) -> Plant | None: ...

    async def get_disease(self, plant_slug: str, disease_slug: str) -> DiseaseWithPlant | None: ...


@dataclass(frozen=True)
class Resolution:
    verdict: ScanVerdict
    plant_id: int | None
    disease_id: int | None
    confidence: str | None
    raw: dict[str, Any]


def normalize_slug(value: object) -> str:
    """Lowercase and join words with single hyphens: "Early_Blight " becomes "early-blight"."""
    if not isinstance(value, str):
        return ""
    return _NON_SLUG.sub("-", value.strip().lower()).strip("-")


def parse_confidence(value: object) -> str | None:
    """Keep a confidence only when it is a finite number between 0 and 1."""
    if not isinstance(value, str | int | float) or isinstance(value, bool):
        return None
    try:
        number = float(value)
    except ValueError:
        return None
    if not math.isfinite(number) or not 0.0 <= number <= 1.0:
        return None
    return str(value).strip()[:MAX_CONFIDENCE_LENGTH] if isinstance(value, str) else f"{number:.4f}"


async def _find_disease(
    catalog: CatalogLookup, plant: Plant, disease_slug: str
) -> DiseaseWithPlant | None:
    candidates = [disease_slug]
    prefix = f"{plant.slug}-"
    if disease_slug.startswith(prefix):
        candidates.append(disease_slug.removeprefix(prefix))
    for candidate in candidates:
        found = await catalog.get_disease(plant.slug, candidate)
        if found is not None:
            return found
    return None


async def resolve_prediction(prediction: Mapping[str, Any], catalog: CatalogLookup) -> Resolution:
    raw = dict(prediction)
    confidence = parse_confidence(raw.get("confidence"))
    plant_slug = normalize_slug(raw.get("plant"))
    plant_slug = PLANT_ALIASES.get(plant_slug, plant_slug)
    plant = await catalog.get_plant(plant_slug) if plant_slug and plant_slug != UNKNOWN else None
    if plant is None:
        return Resolution(ScanVerdict.UNKNOWN, None, None, confidence, raw)

    disease_slug = normalize_slug(raw.get("disease"))
    if disease_slug == HEALTHY:
        return Resolution(ScanVerdict.HEALTHY, plant.id, None, confidence, raw)
    found = None
    if disease_slug and disease_slug != UNKNOWN:
        found = await _find_disease(catalog, plant, disease_slug)
    if found is None:
        return Resolution(ScanVerdict.UNKNOWN, plant.id, None, confidence, raw)
    return Resolution(ScanVerdict.DISEASE, plant.id, found.disease.id, confidence, raw)
