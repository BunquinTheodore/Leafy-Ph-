"""Extract the Leafy seed catalog from the DAHON MySQL dump.

Usage (from ``api/``)::

    uv run python -m tools.extract_dahon [--dump PATH] [--plants-dir PATH]
                                         [--extra-images DIR] [--out DIR]

Outputs, under ``app/seeds``: ``data/*.json``, ``images/``, ``plant_photos/``,
``verdict_samples/``, ``labels.json`` and ``cleaning_report.md``. The dump is
streamed (never loaded whole) and no MySQL server is needed.

``--extra-images`` supplies replacement images laid out as
``<plant slug>/<disease slug>/*.jpg`` plus ``_healthy/`` and ``_unknown/``; use
it when the dump's own image blobs are unusable.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import tempfile
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from tools.lint_seeds import lint_seed_data
from tools.mysql_dump import Row, as_int, iter_table_rows
from tools.seed_build import Catalog, CatalogError, RawTables, build_catalog, build_labels
from tools.seed_config import DEFAULT_CONFIG_PATH, SeedConfig, load_config
from tools.seed_media import (
    DISEASE_IMAGES_DIR,
    PLANT_PHOTOS_DIR,
    VERDICT_SAMPLES_DIR,
    VERDICTS,
    MediaResult,
    SourceImage,
    build_plant_photos,
    entity_names,
    ingest_images,
    iter_directory_images,
    iter_dump_images,
)
from tools.seed_report import ReportInputs, render_report

API_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = API_DIR.parent
DEFAULT_DUMP = REPO_DIR / "DAHON-main/DAHON-main/app/backend/Database/init (1).sql"
DEFAULT_PLANTS_DIR = REPO_DIR / "DAHON-main/DAHON-main/app/frontend/assets/plant"
DEFAULT_OUT = API_DIR / "app" / "seeds"
TEXT_TABLES = (
    "plant",
    "growth_condition",
    "disease",
    "symptom",
    "treatment",
    "prevention",
    "species_affected",
)
GENERATED_DIRS = (DISEASE_IMAGES_DIR, VERDICT_SAMPLES_DIR, PLANT_PHOTOS_DIR)
GENERATED_FILES = (
    "data/plants.json",
    "data/diseases.json",
    "data/entries.json",
    "data/affected_species.json",
    "data/images.json",
    "data/verdict_samples.json",
    "labels.json",
    "cleaning_report.md",
)
REQUIRED_TABLES = ("plant", "growth_condition", "disease")


@dataclass(frozen=True)
class ExpectedCounts:
    """Plant and disease totals the finished catalog must have."""

    plants: int
    diseases: int


DEFAULT_EXPECTED = ExpectedCounts(plants=13, diseases=27)


def read_tables(dump: Path) -> RawTables:
    """First pass over the dump: every table except the image blobs."""
    rows: dict[str, list[Row]] = {name: [] for name in TEXT_TABLES}
    for table, row in iter_table_rows(dump, set(TEXT_TABLES)):
        rows[table].append(row)
    empty = [name for name in REQUIRED_TABLES if not rows[name]]
    if empty:
        raise CatalogError(
            f"no rows parsed for required table(s) {', '.join(empty)} in {dump}; "
            "is this a mysqldump file with plain INSERT statements?"
        )
    return RawTables(**rows)


def _verdict_ids(tables: RawTables, config: SeedConfig) -> dict[int, str]:
    """Disease ids of the dropped Healthy and Unknown rows, mapped to their verdict."""
    found: dict[int, str] = {}
    for row in tables.disease:
        name = str(row[1])
        if name in config.drop_diseases and name.lower() in VERDICTS:
            found[as_int(row[0])] = name.lower()
    return found


def collect_media(
    dump: Path,
    tables: RawTables,
    catalog: Catalog,
    config: SeedConfig,
    extra_images: Path | None,
) -> tuple[list[SourceImage], int]:
    """Second pass: sample_image rows (and optional replacement images) as sources."""
    verdicts = _verdict_ids(tables, config)
    rows = [row for _table, row in iter_table_rows(dump, {"sample_image"})]
    sources = list(iter_dump_images(rows, catalog.disease_ids, verdicts))
    if extra_images is not None:
        valid = {(d["plant"], d["slug"]) for d in catalog.diseases}
        sources.extend(iter_directory_images(extra_images, valid))
    return sources, len(rows)


def _clear_generated(out_dir: Path) -> None:
    for name in GENERATED_DIRS:
        folder = out_dir / name
        if not folder.exists():
            continue
        for item in folder.iterdir():
            if item.name == ".gitkeep":
                continue
            shutil.rmtree(item) if item.is_dir() else item.unlink()


def _publish(staging: Path, out_dir: Path) -> None:
    """Swap a fully built staging tree into ``out_dir`` (only called after success)."""
    _clear_generated(out_dir)
    for name in GENERATED_DIRS:
        source = staging / name
        if not source.exists():
            continue
        target = out_dir / name
        target.mkdir(parents=True, exist_ok=True)
        for item in source.iterdir():
            shutil.move(str(item), str(target / item.name))
    for relative in GENERATED_FILES:
        target = out_dir / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        os.replace(staging / relative, target)


def _check_counts(catalog: Catalog, expected: ExpectedCounts | None) -> None:
    if expected is None:
        return
    if len(catalog.plants) != expected.plants:
        raise CatalogError(f"expected {expected.plants} plants, got {len(catalog.plants)}")
    if len(catalog.diseases) != expected.diseases:
        raise CatalogError(f"expected {expected.diseases} diseases, got {len(catalog.diseases)}")


def _write_json(path: Path, document: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(document, indent=2, ensure_ascii=False) + "\n"
    path.write_text(text, encoding="utf-8", newline="\n")


def _write_outputs(
    out_dir: Path, catalog: Catalog, plants: list[dict[str, Any]], media: MediaResult
) -> None:
    data = out_dir / "data"
    _write_json(data / "plants.json", plants)
    _write_json(data / "diseases.json", catalog.diseases)
    _write_json(data / "entries.json", catalog.entries)
    _write_json(data / "affected_species.json", catalog.species)
    _write_json(data / "images.json", media.images)
    _write_json(data / "verdict_samples.json", media.verdict_samples)
    _write_json(out_dir / "labels.json", build_labels(catalog))


def _build(
    dump: Path,
    plants_dir: Path,
    staging: Path,
    config: SeedConfig,
    extra_images: Path | None,
    expected: ExpectedCounts | None,
) -> tuple[Catalog, MediaResult]:
    tables = read_tables(dump)
    catalog = build_catalog(tables, config)
    _check_counts(catalog, expected)
    plants, photo_notes = build_plant_photos(catalog.plants, plants_dir, config, staging)
    sources, dump_rows = collect_media(dump, tables, catalog, config, extra_images)
    names = entity_names(plants, catalog.diseases)
    media = ingest_images(sources, staging, names)
    _write_outputs(staging, catalog, plants, media)
    report = ReportInputs(catalog, media, photo_notes, dump_rows, extra_images is not None)
    (staging / "cleaning_report.md").write_text(
        render_report(report), encoding="utf-8", newline="\n"
    )
    problems = lint_seed_data(staging / "data")
    if problems:
        raise CatalogError("seed lint failed:\n" + "\n".join(problems))
    return catalog, media


def run_extraction(
    dump: Path,
    plants_dir: Path,
    out_dir: Path,
    config: SeedConfig,
    extra_images: Path | None = None,
    expected: ExpectedCounts | None = None,
) -> tuple[Catalog, MediaResult]:
    """Build every output in a staging directory; publish into ``out_dir`` only on success."""
    out_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".extract-", dir=out_dir.parent) as staging_name:
        staging = Path(staging_name)
        result = _build(dump, plants_dir, staging, config, extra_images, expected)
        _publish(staging, out_dir)
    return result


def _parse_args(argv: Sequence[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--dump", type=Path, default=DEFAULT_DUMP)
    parser.add_argument("--plants-dir", type=Path, default=DEFAULT_PLANTS_DIR)
    parser.add_argument("--extra-images", type=Path, default=None)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--expect-plants", type=int, default=DEFAULT_EXPECTED.plants)
    parser.add_argument("--expect-diseases", type=int, default=DEFAULT_EXPECTED.diseases)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG_PATH)
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = _parse_args(argv)
    config = load_config(args.config)
    expected = ExpectedCounts(args.expect_plants, args.expect_diseases)
    catalog, media = run_extraction(
        args.dump, args.plants_dir, args.out, config, args.extra_images, expected
    )
    sys.stdout.write(
        f"plants={len(catalog.plants)} diseases={len(catalog.diseases)} "
        f"entries={len(catalog.entries)} images={len(media.images)} "
        f"verdict_samples={len(media.verdict_samples)} rejected_images={len(media.rejected)}\n"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
