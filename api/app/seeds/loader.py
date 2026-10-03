"""Seed loader: committed JSON to the catalog tables, one transaction, idempotent.

Rows are upserted by their natural keys (plant slug, plant plus disease slug, entry position,
species, image hash). Nothing is ever deleted, so a rerun only brings rows up to date and
manual additions survive. Catalog images go to the public bucket only when the key is missing.
"""

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict, ValidationError
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.logging import get_logger
from app.db.models import (
    Disease,
    DiseaseAffectedSpecies,
    DiseaseEntry,
    DiseaseImage,
    EntryKind,
    PathogenType,
    Plant,
)
from app.services.infra.storage_service import StorageService

SEEDS_DIR = Path(__file__).resolve().parent
EXPECTED_PLANTS = 13
EXPECTED_DISEASES = 27
PLANTS_WITHOUT_DISEASES = frozenset({"blueberry", "soybean"})

# The extraction tool writes the short forms; the database enum uses the organism names.
PATHOGEN_TYPES: dict[str, PathogenType] = {
    "fungal": PathogenType.FUNGUS,
    "bacterial": PathogenType.BACTERIUM,
    "viral": PathogenType.VIRUS,
    "oomycete": PathogenType.OOMYCETE,
    "pest": PathogenType.PEST,
    "other": PathogenType.OTHER,
}
CONTENT_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}

_log = get_logger("leafy.seeds")


class SeedError(Exception):
    """The seed files are missing, malformed or inconsistent."""


class _Row(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True)


class PlantSeed(_Row):
    slug: str
    name: str
    scientific_name: str | None = None
    family: str | None = None
    type: str | None = None
    soil_type: str | None = None
    light: str | None = None
    water_needs: str | None = None
    temperature: str | None = None
    photo: str | None = None
    photo_alt: str | None = None


class DiseaseSeed(_Row):
    plant: str
    slug: str
    name: str
    display_name: str | None = None
    cause: str | None = None
    pathogen_type: str | None = None
    pathogen_name: str | None = None
    severity: str | None = None


class EntrySeed(_Row):
    plant: str
    disease: str
    kind: EntryKind
    position: int
    text: str


class SpeciesSeed(_Row):
    plant: str
    disease: str
    species: str


class ImageSeed(_Row):
    plant: str
    disease: str
    key: str
    sha256: str
    alt: str | None = None
    position: int = 0


@dataclass(frozen=True)
class SeedBundle:
    plants: tuple[PlantSeed, ...]
    diseases: tuple[DiseaseSeed, ...]
    entries: tuple[EntrySeed, ...]
    species: tuple[SpeciesSeed, ...]
    images: tuple[ImageSeed, ...]
    seeds_dir: Path

    def catalog_images(self) -> dict[str, Path]:
        """Bucket key to local file for every image that belongs in the catalog bucket."""
        keys = [p.photo for p in self.plants if p.photo] + [i.key for i in self.images]
        return {key: self.seeds_dir / key for key in keys}


@dataclass(frozen=True)
class SeedReport:
    plants: int
    diseases: int
    entries: int
    affected_species: int
    images: int
    uploaded: int
    already_present: int


@dataclass(frozen=True)
class CheckResult:
    problems: tuple[str, ...]

    @property
    def ok(self) -> bool:
        return not self.problems


def _read_json(path: Path) -> list[dict[str, Any]]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise SeedError(f"cannot read {path.name}") from exc
    if not isinstance(payload, list):
        raise SeedError(f"{path.name} must contain a list")
    return payload


def _parse[T: _Row](model: type[T], rows: list[dict[str, Any]], name: str) -> tuple[T, ...]:
    try:
        return tuple(model.model_validate(row) for row in rows)
    except ValidationError as exc:
        raise SeedError(f"{name} has an invalid row: {exc.error_count()} problem(s)") from exc


def _check_references(bundle: SeedBundle) -> None:
    plants = {p.slug for p in bundle.plants}
    diseases = {(d.plant, d.slug) for d in bundle.diseases}
    referenced = (
        [(e.plant, e.disease) for e in bundle.entries]
        + [(s.plant, s.disease) for s in bundle.species]
        + [(i.plant, i.disease) for i in bundle.images]
    )
    for disease in bundle.diseases:
        if disease.plant not in plants:
            raise SeedError(f"disease {disease.slug} references unknown plant {disease.plant}")
        if disease.pathogen_type is not None and disease.pathogen_type not in PATHOGEN_TYPES:
            raise SeedError(f"disease {disease.slug} has unknown pathogen type")
    for plant_slug, disease_slug in referenced:
        if (plant_slug, disease_slug) not in diseases:
            raise SeedError(f"row references unknown disease {plant_slug}/{disease_slug}")


def load_bundle(seeds_dir: Path = SEEDS_DIR) -> SeedBundle:
    data = seeds_dir / "data"
    bundle = SeedBundle(
        plants=_parse(PlantSeed, _read_json(data / "plants.json"), "plants.json"),
        diseases=_parse(DiseaseSeed, _read_json(data / "diseases.json"), "diseases.json"),
        entries=_parse(EntrySeed, _read_json(data / "entries.json"), "entries.json"),
        species=_parse(SpeciesSeed, _read_json(data / "affected_species.json"), "species"),
        images=_parse(ImageSeed, _read_json(data / "images.json"), "images.json"),
        seeds_dir=seeds_dir,
    )
    _check_references(bundle)
    return bundle


def _content_type(path: Path) -> str:
    return CONTENT_TYPES.get(path.suffix.lower(), "application/octet-stream")


async def upload_missing_images(
    bundle: SeedBundle, storage: StorageService, bucket: str
) -> tuple[int, int]:
    """Upload catalog images whose key is absent. Returns (uploaded, already_present)."""
    uploaded = present = 0
    for key, path in sorted(bundle.catalog_images().items()):
        if await storage.object_exists(bucket, key):
            present += 1
            continue
        try:
            data = path.read_bytes()
        except OSError as exc:
            raise SeedError(f"image file is missing for key {key}") from exc
        await storage.put_object(bucket, key, data, _content_type(path))
        uploaded += 1
    return uploaded, present


def _plant_rows(bundle: SeedBundle) -> list[dict[str, Any]]:
    return [
        {
            "slug": p.slug,
            "common_name": p.name,
            "scientific_name": p.scientific_name,
            "family": p.family,
            "plant_type": p.type,
            "soil_type": p.soil_type,
            "light": p.light,
            "water_needs": p.water_needs,
            "temperature": p.temperature,
            "image_key": p.photo,
            "image_alt": p.photo_alt,
        }
        for p in bundle.plants
    ]


async def _upsert_plants(session: AsyncSession, bundle: SeedBundle) -> dict[str, int]:
    statement = insert(Plant).values(_plant_rows(bundle))
    updatable = {c: statement.excluded[c] for c in _plant_rows(bundle)[0] if c != "slug"}
    statement = statement.on_conflict_do_update(index_elements=[Plant.slug], set_=updatable)
    result = await session.execute(statement.returning(Plant.slug, Plant.id))
    return dict(result.all())


async def _upsert_diseases(
    session: AsyncSession, bundle: SeedBundle, plant_ids: dict[str, int]
) -> dict[tuple[str, str], int]:
    rows = [
        {
            "plant_id": plant_ids[d.plant],
            "slug": d.slug,
            "name": d.name,
            "display_name": d.display_name,
            "cause": d.cause,
            "pathogen_type": PATHOGEN_TYPES[d.pathogen_type] if d.pathogen_type else None,
            "pathogen_name": d.pathogen_name,
            "severity": d.severity,
        }
        for d in bundle.diseases
    ]
    statement = insert(Disease).values(rows)
    updatable = {c: statement.excluded[c] for c in rows[0] if c not in ("plant_id", "slug")}
    statement = statement.on_conflict_do_update(
        index_elements=[Disease.plant_id, Disease.slug], set_=updatable
    )
    result = await session.execute(statement.returning(Disease.plant_id, Disease.slug, Disease.id))
    by_plant_id = {plant_id: slug for slug, plant_id in plant_ids.items()}
    return {
        (by_plant_id[plant_id], slug): disease_id for plant_id, slug, disease_id in result.all()
    }


async def _upsert_children(
    session: AsyncSession, bundle: SeedBundle, disease_ids: dict[tuple[str, str], int]
) -> None:
    if bundle.entries:
        statement = insert(DiseaseEntry).values(
            [
                {
                    "disease_id": disease_ids[(e.plant, e.disease)],
                    "kind": e.kind,
                    "position": e.position,
                    "text": e.text,
                }
                for e in bundle.entries
            ]
        )
        await session.execute(
            statement.on_conflict_do_update(
                index_elements=[DiseaseEntry.disease_id, DiseaseEntry.kind, DiseaseEntry.position],
                set_={"text": statement.excluded.text},
            )
        )
    if bundle.species:
        await session.execute(
            insert(DiseaseAffectedSpecies)
            .values(
                [
                    {"disease_id": disease_ids[(s.plant, s.disease)], "species": s.species}
                    for s in bundle.species
                ]
            )
            .on_conflict_do_nothing(
                index_elements=[DiseaseAffectedSpecies.disease_id, DiseaseAffectedSpecies.species]
            )
        )
    if bundle.images:
        statement = insert(DiseaseImage).values(
            [
                {
                    "disease_id": disease_ids[(i.plant, i.disease)],
                    "storage_key": i.key,
                    "sha256": i.sha256,
                    "alt_text": i.alt,
                    "position": i.position,
                }
                for i in bundle.images
            ]
        )
        await session.execute(
            statement.on_conflict_do_update(
                index_elements=[DiseaseImage.disease_id, DiseaseImage.sha256],
                set_={
                    "storage_key": statement.excluded.storage_key,
                    "alt_text": statement.excluded.alt_text,
                    "position": statement.excluded.position,
                },
            )
        )


async def seed_database(
    session_factory: async_sessionmaker[AsyncSession],
    bundle: SeedBundle,
    *,
    storage: StorageService | None = None,
    catalog_bucket: str = "leafy-catalog",
) -> SeedReport:
    """Upload missing images (when `storage` is given), then write every row in one transaction."""
    uploaded = present = 0
    if storage is not None:
        uploaded, present = await upload_missing_images(bundle, storage, catalog_bucket)
    async with session_factory() as session, session.begin():
        plant_ids = await _upsert_plants(session, bundle)
        disease_ids = await _upsert_diseases(session, bundle, plant_ids)
        await _upsert_children(session, bundle, disease_ids)
    report = SeedReport(
        plants=len(bundle.plants),
        diseases=len(bundle.diseases),
        entries=len(bundle.entries),
        affected_species=len(bundle.species),
        images=len(bundle.images),
        uploaded=uploaded,
        already_present=present,
    )
    _log.info("seed_loaded", **report.__dict__)
    return report


def _labels(seeds_dir: Path) -> dict[str, list[str]]:
    try:
        payload = json.loads((seeds_dir / "labels.json").read_text(encoding="utf-8"))
        plants = payload["plants"]
    except (OSError, ValueError, KeyError) as exc:
        raise SeedError("cannot read labels.json") from exc
    return {slug: list(diseases) for slug, diseases in plants.items()}


async def _disease_slugs_by_plant(session: AsyncSession) -> dict[str, set[str]]:
    result = await session.execute(
        select(Plant.slug, Disease.slug).outerjoin(Disease, Disease.plant_id == Plant.id)
    )
    found: dict[str, set[str]] = {}
    for plant_slug, disease_slug in result.all():
        found.setdefault(plant_slug, set())
        if disease_slug is not None:
            found[plant_slug].add(disease_slug)
    return found


async def check_database(
    session_factory: async_sessionmaker[AsyncSession], seeds_dir: Path = SEEDS_DIR
) -> CheckResult:
    """Assert the catalog matches the seed contract (counts and labels.json)."""
    async with session_factory() as session:
        plant_count = (await session.execute(select(func.count()).select_from(Plant))).scalar_one()
        disease_count = (
            await session.execute(select(func.count()).select_from(Disease))
        ).scalar_one()
        found = await _disease_slugs_by_plant(session)
    problems: list[str] = []
    if plant_count != EXPECTED_PLANTS:
        problems.append(f"expected {EXPECTED_PLANTS} plants, found {plant_count}")
    if disease_count != EXPECTED_DISEASES:
        problems.append(f"expected {EXPECTED_DISEASES} diseases, found {disease_count}")
    for slug in sorted(PLANTS_WITHOUT_DISEASES):
        if slug not in found:
            problems.append(f"plant {slug} is missing")
        elif found[slug]:
            problems.append(f"plant {slug} should have no diseases")
    for slug, expected in _labels(seeds_dir).items():
        if found.get(slug) != set(expected):
            problems.append(f"diseases of {slug} do not match labels.json")
    return CheckResult(problems=tuple(problems))
