"""Small pure pieces: caching helpers, backoff, query normalizing, background runner, jobs."""

import asyncio
import json
from pathlib import Path
from typing import Any

import pytest
from app.controllers.catalog_controller import normalize_query
from app.core.background import BackgroundRunner
from app.http.caching import etag_for, matches_if_none_match
from app.jobs import purge_storage
from app.repositories.catalog_repository import like_pattern
from app.schemas.catalog import PlantRefOut
from app.seeds.loader import SEEDS_DIR, SeedError, load_bundle
from app.services.purge_service import backoff_seconds


def test_etag_is_stable_and_content_dependent() -> None:
    a = PlantRefOut(slug="tomato", name="Tomato")
    assert etag_for(a) == etag_for(PlantRefOut(slug="tomato", name="Tomato"))
    assert etag_for(a) != etag_for(PlantRefOut(slug="tomato", name="Tomatoes"))
    assert etag_for(a).startswith('W/"') and etag_for(a).endswith('"')


@pytest.mark.parametrize(
    ("header", "expected"),
    [
        (None, False),
        ("", False),
        ('W/"abc"', True),
        ('"abc"', True),
        ('"zzz", W/"abc"', True),
        ("*", True),
        ('W/"nope"', False),
        ("abc", False),
    ],
)
def test_if_none_match_comparison(header: str | None, expected: bool) -> None:
    assert matches_if_none_match(header, 'W/"abc"') is expected


def test_backoff_grows_exponentially_and_is_capped() -> None:
    assert [backoff_seconds(n) for n in (1, 2, 3, 4)] == [30, 60, 120, 240]
    assert backoff_seconds(0) == 30
    assert backoff_seconds(50) == 3600


def test_like_pattern_escapes_wildcards() -> None:
    assert like_pattern("50%_off\\") == "%50\\%\\_off\\\\%"


def test_normalize_query() -> None:
    assert normalize_query(None) is None
    assert normalize_query("   ") is None
    assert normalize_query("  early   blight ") == "early blight"
    assert len(normalize_query("a" * 500) or "") == 100


async def test_background_runner_runs_tasks_and_drain_waits_for_them() -> None:
    runner = BackgroundRunner()
    done: list[int] = []

    async def work(value: int) -> None:
        await asyncio.sleep(0.01)
        done.append(value)

    runner.spawn(work(1))
    runner.spawn(work(2))
    assert done == []
    await runner.drain()
    assert sorted(done) == [1, 2]


async def test_background_runner_swallows_and_logs_failures() -> None:
    runner = BackgroundRunner()

    async def failing() -> None:
        raise RuntimeError("secret detail")

    runner.spawn(failing())
    await runner.drain()  # must not raise


async def test_purge_loop_keeps_going_after_a_failed_tick(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = {"drain": 0, "cleanup": 0}

    class FlakyPurge:
        async def drain_all(self) -> None:
            calls["drain"] += 1
            if calls["drain"] == 2:
                raise RuntimeError("boom")

    async def fake_cleanup(*_: Any) -> None:
        calls["cleanup"] += 1

    monkeypatch.setattr(purge_storage, "cleanup_tokens", fake_cleanup)
    await purge_storage.run_loop(
        None,  # type: ignore[arg-type]
        FlakyPurge(),  # type: ignore[arg-type]
        interval_seconds=0,
        max_ticks=3,
    )
    assert calls["drain"] == 3
    assert calls["cleanup"] == 1  # runs on tick 0 only; tick 1 failed, tick 2 is off the beat


def _copy(tmp_path: Path) -> Path:
    import shutil

    target = tmp_path / "seeds"
    shutil.copytree(SEEDS_DIR / "data", target / "data")
    return target


def _rewrite(path: Path, change: Any) -> None:
    rows = json.loads(path.read_text(encoding="utf-8"))
    change(rows)
    path.write_text(json.dumps(rows), encoding="utf-8")


def test_the_committed_seed_parses() -> None:
    bundle = load_bundle()
    assert (len(bundle.plants), len(bundle.diseases)) == (13, 27)
    assert set(bundle.catalog_images()) >= {"plant_photos/tomato.jpg"}


def test_a_disease_with_an_unknown_plant_is_rejected(tmp_path: Path) -> None:
    seeds = _copy(tmp_path)
    _rewrite(seeds / "data" / "diseases.json", lambda rows: rows[0].update(plant="dragonfruit"))
    with pytest.raises(SeedError, match="unknown plant"):
        load_bundle(seeds)


def test_an_unknown_pathogen_type_is_rejected(tmp_path: Path) -> None:
    seeds = _copy(tmp_path)
    _rewrite(seeds / "data" / "diseases.json", lambda rows: rows[0].update(pathogen_type="alien"))
    with pytest.raises(SeedError, match="pathogen type"):
        load_bundle(seeds)


def test_an_entry_for_an_unknown_disease_is_rejected(tmp_path: Path) -> None:
    seeds = _copy(tmp_path)
    _rewrite(seeds / "data" / "entries.json", lambda rows: rows[0].update(disease="nope"))
    with pytest.raises(SeedError, match="unknown disease"):
        load_bundle(seeds)


def test_a_malformed_row_is_rejected(tmp_path: Path) -> None:
    seeds = _copy(tmp_path)
    _rewrite(seeds / "data" / "entries.json", lambda rows: rows[0].update(kind="gossip"))
    with pytest.raises(SeedError, match="invalid row"):
        load_bundle(seeds)


def test_a_missing_or_non_list_file_is_rejected(tmp_path: Path) -> None:
    seeds = _copy(tmp_path)
    (seeds / "data" / "plants.json").write_text('{"not": "a list"}', encoding="utf-8")
    with pytest.raises(SeedError, match="must contain a list"):
        load_bundle(seeds)
    (seeds / "data" / "plants.json").unlink()
    with pytest.raises(SeedError, match="cannot read"):
        load_bundle(seeds)
