from types import SimpleNamespace
from typing import Any

import pytest
from app.db.models import ScanVerdict
from app.services.prediction_resolver import normalize_slug, resolve_prediction

PLANTS = {"tomato": 1, "bell-pepper": 2, "corn": 3}
DISEASES = {("tomato", "early-blight"): 10, ("bell-pepper", "bacterial-spot"): 20}


class FakeCatalog:
    async def get_plant(self, slug: str) -> Any:
        return SimpleNamespace(id=PLANTS[slug], slug=slug) if slug in PLANTS else None

    async def get_disease(self, plant_slug: str, disease_slug: str) -> Any:
        key = (plant_slug, disease_slug)
        if key not in DISEASES:
            return None
        return SimpleNamespace(
            disease=SimpleNamespace(id=DISEASES[key]), plant=SimpleNamespace(id=PLANTS[plant_slug])
        )


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Tomato", "tomato"),
        ("  early_blight ", "early-blight"),
        ("Early Blight", "early-blight"),
        ("bell--pepper", "bell-pepper"),
        ("-x-", "x"),
        ("", ""),
    ],
)
def test_normalize_slug(raw: str, expected: str) -> None:
    assert normalize_slug(raw) == expected


async def test_disease_match() -> None:
    result = await resolve_prediction(
        {"plant": "tomato", "disease": "early-blight", "confidence": "0.93"}, FakeCatalog()
    )
    assert result.verdict is ScanVerdict.DISEASE
    assert (result.plant_id, result.disease_id) == (1, 10)
    assert result.confidence == "0.93"


@pytest.mark.parametrize("alias", ["pepper-bell", "Bell Pepper", "pepper", "bell_pepper"])
async def test_plant_aliases_to_bell_pepper(alias: str) -> None:
    result = await resolve_prediction({"plant": alias, "disease": "bacterial-spot"}, FakeCatalog())
    assert result.plant_id == 2
    assert result.disease_id == 20


async def test_maize_alias() -> None:
    result = await resolve_prediction({"plant": "maize", "disease": "healthy"}, FakeCatalog())
    assert result.verdict is ScanVerdict.HEALTHY
    assert (result.plant_id, result.disease_id) == (3, None)


async def test_disease_slug_prefixed_with_plant_is_accepted() -> None:
    result = await resolve_prediction(
        {"plant": "tomato", "disease": "tomato-early-blight"}, FakeCatalog()
    )
    assert result.disease_id == 10


async def test_unknown_plant_gives_unknown_without_plant() -> None:
    result = await resolve_prediction({"plant": "banana", "disease": "healthy"}, FakeCatalog())
    assert result.verdict is ScanVerdict.UNKNOWN
    assert (result.plant_id, result.disease_id) == (None, None)


async def test_unmatched_disease_keeps_plant() -> None:
    result = await resolve_prediction({"plant": "tomato", "disease": "made-up"}, FakeCatalog())
    assert result.verdict is ScanVerdict.UNKNOWN
    assert (result.plant_id, result.disease_id) == (1, None)


async def test_explicit_unknown_disease_keeps_plant() -> None:
    result = await resolve_prediction({"plant": "tomato", "disease": "unknown"}, FakeCatalog())
    assert result.verdict is ScanVerdict.UNKNOWN
    assert result.plant_id == 1


async def test_disease_of_another_plant_is_unmatched() -> None:
    result = await resolve_prediction({"plant": "corn", "disease": "early-blight"}, FakeCatalog())
    assert result.verdict is ScanVerdict.UNKNOWN
    assert result.plant_id == 3


async def test_missing_keys_are_unknown() -> None:
    result = await resolve_prediction({}, FakeCatalog())
    assert result.verdict is ScanVerdict.UNKNOWN
    assert result.raw == {}


@pytest.mark.parametrize("confidence", ["abc", "1.5", "-0.1", "nan", "", None, 7])
async def test_bad_confidence_is_dropped(confidence: Any) -> None:
    result = await resolve_prediction(
        {"plant": "tomato", "disease": "healthy", "confidence": confidence}, FakeCatalog()
    )
    assert result.confidence is None


async def test_raw_prediction_is_kept_verbatim() -> None:
    raw = {"plant": "Tomato", "disease": "Zzz", "confidence": "0.5", "extra": "kept"}
    result = await resolve_prediction(raw, FakeCatalog())
    assert result.raw == raw
    assert result.confidence == "0.5"
