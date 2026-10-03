"""The seed loader against the committed data and a real Postgres."""

import json
import shutil
from pathlib import Path

import pytest
from app.db.models import Disease, DiseaseEntry, Plant
from app.seeds.loader import (
    SEEDS_DIR,
    SeedError,
    check_database,
    load_bundle,
    seed_database,
)
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from tests.support.fakes import FakeStorage

pytestmark = pytest.mark.integration

Factory = async_sessionmaker[AsyncSession]


async def _count(factory: Factory, model: type) -> int:
    async with factory() as session:
        return int((await session.execute(select(func.count()).select_from(model))).scalar_one())


def _copy_seeds(tmp_path: Path) -> Path:
    target = tmp_path / "seeds"
    shutil.copytree(SEEDS_DIR / "data", target / "data")
    shutil.copy(SEEDS_DIR / "labels.json", target / "labels.json")
    shutil.copytree(SEEDS_DIR / "plant_photos", target / "plant_photos")
    return target


async def test_loading_the_committed_seed_creates_the_expected_catalog(
    session_factory: Factory,
) -> None:
    report = await seed_database(session_factory, load_bundle())
    assert (report.plants, report.diseases) == (13, 27)
    assert await _count(session_factory, Plant) == 13
    assert await _count(session_factory, Disease) == 27
    assert await _count(session_factory, DiseaseEntry) == report.entries == 308


async def test_blueberry_and_soybean_have_no_diseases(session_factory: Factory) -> None:
    await seed_database(session_factory, load_bundle())
    async with session_factory() as session:
        rows = await session.execute(
            select(Plant.slug, func.count(Disease.id))
            .outerjoin(Disease, Disease.plant_id == Plant.id)
            .where(Plant.slug.in_(["blueberry", "soybean"]))
            .group_by(Plant.slug)
        )
        assert dict(rows.all()) == {"blueberry": 0, "soybean": 0}


async def test_pathogen_types_use_the_database_enum_values(session_factory: Factory) -> None:
    await seed_database(session_factory, load_bundle())
    async with session_factory() as session:
        values = (
            await session.execute(
                select(Disease.pathogen_type).where(Disease.pathogen_type.is_not(None)).distinct()
            )
        ).scalars()
        assert {v.value for v in values} <= {"fungus", "bacterium", "virus", "oomycete", "pest"}
        late = (
            await session.execute(
                select(Disease.pathogen_type)
                .join(Plant)
                .where(Plant.slug == "tomato", Disease.slug == "late-blight")
            )
        ).scalar_one()
        assert late.value == "oomycete"


async def test_loading_twice_changes_nothing(session_factory: Factory) -> None:
    bundle = load_bundle()
    await seed_database(session_factory, bundle)
    async with session_factory() as session:
        before = (await session.execute(select(Plant.id, Plant.slug).order_by(Plant.id))).all()
        entry_ids = (await session.execute(select(DiseaseEntry.id).order_by(DiseaseEntry.id))).all()
    await seed_database(session_factory, bundle)
    async with session_factory() as session:
        after = (await session.execute(select(Plant.id, Plant.slug).order_by(Plant.id))).all()
        entry_ids_after = (
            await session.execute(select(DiseaseEntry.id).order_by(DiseaseEntry.id))
        ).all()
    assert before == after
    assert entry_ids == entry_ids_after
    assert await _count(session_factory, Disease) == 27


async def test_a_rerun_updates_changed_text_and_never_deletes(
    session_factory: Factory, tmp_path: Path
) -> None:
    seeds = _copy_seeds(tmp_path)
    await seed_database(session_factory, load_bundle(seeds))
    async with session_factory() as session:
        session.add(Plant(slug="extra", common_name="Extra"))
        await session.commit()

    entries_file = seeds / "data" / "entries.json"
    entries = json.loads(entries_file.read_text(encoding="utf-8"))
    entries[0]["text"] = "Edited symptom text"
    dropped = entries.pop()  # an entry that disappears from the data
    entries_file.write_text(json.dumps(entries), encoding="utf-8")
    await seed_database(session_factory, load_bundle(seeds))

    async with session_factory() as session:
        texts = set((await session.execute(select(DiseaseEntry.text))).scalars())
        assert "Edited symptom text" in texts
        assert dropped["text"] in texts, "rows are never deleted"
        assert (
            await session.execute(select(Plant.id).where(Plant.slug == "extra"))
        ).scalar_one_or_none() is not None
    assert await _count(session_factory, DiseaseEntry) == 308


async def test_everything_is_written_in_one_transaction(
    session_factory: Factory, tmp_path: Path
) -> None:
    seeds = _copy_seeds(tmp_path)
    species_file = seeds / "data" / "affected_species.json"
    species = json.loads(species_file.read_text(encoding="utf-8"))
    species[-1]["species"] = "x" * 200  # longer than the column: fails after plants were written
    species_file.write_text(json.dumps(species), encoding="utf-8")
    with pytest.raises(Exception, match="value too long"):
        await seed_database(session_factory, load_bundle(seeds))
    assert await _count(session_factory, Plant) == 0
    assert await _count(session_factory, Disease) == 0


async def test_plant_photos_are_uploaded_only_when_the_key_is_missing(
    session_factory: Factory,
) -> None:
    storage = FakeStorage()
    storage.objects[("leafy-catalog", "plant_photos/apple.jpg")] = b"already there"
    bundle = load_bundle()

    first = await seed_database(session_factory, bundle, storage=storage)
    assert first.uploaded == 12
    assert first.already_present == 1
    assert storage.objects[("leafy-catalog", "plant_photos/apple.jpg")] == b"already there"
    assert (
        storage.objects[("leafy-catalog", "plant_photos/tomato.jpg")]
        == (SEEDS_DIR / "plant_photos" / "tomato.jpg").read_bytes()
    )

    second = await seed_database(session_factory, bundle, storage=storage)
    assert second.uploaded == 0
    assert second.already_present == 13


async def test_a_missing_image_file_fails_before_any_row_is_written(
    session_factory: Factory, tmp_path: Path
) -> None:
    seeds = _copy_seeds(tmp_path)
    (seeds / "plant_photos" / "tomato.jpg").unlink()
    with pytest.raises(SeedError, match="image file is missing"):
        await seed_database(session_factory, load_bundle(seeds), storage=FakeStorage())
    assert await _count(session_factory, Plant) == 0


async def test_check_fails_on_an_empty_database_and_passes_after_seeding(
    session_factory: Factory,
) -> None:
    empty = await check_database(session_factory)
    assert not empty.ok
    assert any("13 plants" in problem for problem in empty.problems)

    await seed_database(session_factory, load_bundle())
    assert (await check_database(session_factory)).ok


async def test_check_detects_a_missing_disease_and_an_unexpected_one(
    session_factory: Factory,
) -> None:
    await seed_database(session_factory, load_bundle())
    async with session_factory() as session:
        await session.execute(text("DELETE FROM disease WHERE slug = 'apple-scab'"))
        await session.commit()
    result = await check_database(session_factory)
    assert any("26" in p for p in result.problems)
    assert any("apple" in p for p in result.problems)

    await seed_database(session_factory, load_bundle())
    async with session_factory() as session:
        plant_id = (
            await session.execute(select(Plant.id).where(Plant.slug == "blueberry"))
        ).scalar_one()
        session.add(Disease(plant_id=plant_id, slug="mystery", name="Mystery"))
        await session.commit()
    result = await check_database(session_factory)
    assert any("blueberry should have no diseases" in p for p in result.problems)


def test_command_line_loads_and_checks(
    database_url: str, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    from app.core.config import get_settings
    from app.seeds.__main__ import main

    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.setenv("JWT_SECRET", "test-secret-for-unit-tests-0123456789abcdef")
    get_settings.cache_clear()
    try:
        assert main(["--check"]) == 1
        assert main(["--skip-images"]) == 0
        assert "seeded 13 plants, 27 diseases" in capsys.readouterr().out
        assert main(["--check"]) == 0
    finally:
        get_settings.cache_clear()
