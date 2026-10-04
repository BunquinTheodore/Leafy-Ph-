"""Assertions on the committed seed outputs (the contract other streams build on)."""

from __future__ import annotations

import hashlib
import json
import re
from collections import Counter
from io import BytesIO
from pathlib import Path
from typing import Any

import pytest
from PIL import Image
from tools.lint_seeds import lint_seed_data
from tools.seed_config import load_config

SEEDS = Path(__file__).resolve().parents[3] / "app" / "seeds"
DATA = SEEDS / "data"
SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")

GOLDEN_LABELS: dict[str, Any] = {
    "version": 1,
    "reserved": {"healthy": "healthy", "unknown": "unknown"},
    "plants": {
        "apple": ["apple-scab", "black-rot", "cedar-apple-rust"],
        "bell-pepper": ["bacterial-spot", "phytophthora-blight"],
        "blueberry": [],
        "cherry": ["powdery-mildew"],
        "corn": ["common-rust", "gray-leaf-spot", "northern-corn-leaf-blight"],
        "grape": ["black-rot", "esca", "leaf-blight"],
        "orange": ["huanglongbing"],
        "peach": ["bacterial-spot"],
        "potato": ["early-blight", "late-blight"],
        "soybean": [],
        "squash": ["powdery-mildew"],
        "strawberry": ["leaf-scorch"],
        "tomato": [
            "bacterial-spot",
            "early-blight",
            "late-blight",
            "leaf-mold",
            "septoria-leaf-spot",
            "spider-mites",
            "target-spot",
            "tomato-mosaic-virus",
            "tomato-yellow-leaf-curl-virus",
        ],
    },
}


def _load(name: str) -> list[dict[str, Any]]:
    loaded: list[dict[str, Any]] = json.loads((DATA / name).read_text(encoding="utf-8"))
    return loaded


@pytest.fixture(scope="module")
def plants() -> list[dict[str, Any]]:
    return _load("plants.json")


@pytest.fixture(scope="module")
def diseases() -> list[dict[str, Any]]:
    return _load("diseases.json")


def test_exactly_13_plants_and_27_diseases(
    plants: list[dict[str, Any]], diseases: list[dict[str, Any]]
) -> None:
    assert len(plants) == 13
    assert len(diseases) == 27


def test_plant_names_follow_the_merge_rules(plants: list[dict[str, Any]]) -> None:
    names = {p["slug"]: p["name"] for p in plants}
    assert names["bell-pepper"] == "Bell Pepper"
    assert names["corn"] == "Corn"
    assert names["cherry"] == "Cherry"
    assert "unknown" not in names
    assert "raspberry" not in names
    assert {"blueberry", "soybean"} <= set(names)


def test_no_slug_collisions(plants: list[dict[str, Any]], diseases: list[dict[str, Any]]) -> None:
    plant_slugs = [p["slug"] for p in plants]
    assert len(set(plant_slugs)) == len(plant_slugs)
    pairs = [(d["plant"], d["slug"]) for d in diseases]
    assert len(set(pairs)) == len(pairs)
    assert all(SLUG.match(s) for s in plant_slugs)
    assert all(SLUG.match(d["slug"]) for d in diseases)
    assert {d["plant"] for d in diseases} <= set(plant_slugs)


def test_pseudo_diseases_and_typo_are_gone(diseases: list[dict[str, Any]]) -> None:
    slugs = {d["slug"] for d in diseases}
    assert not slugs & {"healthy", "unknown"}
    blob = json.dumps(diseases) + (DATA / "entries.json").read_text(encoding="utf-8")
    assert "Haunglongbing" not in blob
    assert next(d for d in diseases if d["slug"] == "huanglongbing")["plant"] == "orange"


def test_display_names_fit_one_line(diseases: list[dict[str, Any]]) -> None:
    limit = load_config().display_name_max
    assert all(0 < len(d["display_name"]) <= limit for d in diseases)
    long_title = next(d for d in diseases if d["slug"] == "tomato-yellow-leaf-curl-virus")
    assert long_title["name"] == "Tomato Yellow Leaf Curl Virus"
    assert long_title["display_name"] == "Yellow Leaf Curl Virus"


def test_pathogen_fields_are_complete(diseases: list[dict[str, Any]]) -> None:
    allowed = {"fungal", "bacterial", "viral", "pest", "oomycete"}
    assert {d["pathogen_type"] for d in diseases} <= allowed
    assert all(d["pathogen_name"] for d in diseases)
    assert Counter(d["pathogen_type"] for d in diseases)["viral"] == 2


def test_labels_json_matches_golden_shape() -> None:
    labels = json.loads((SEEDS / "labels.json").read_text(encoding="utf-8"))
    assert labels == GOLDEN_LABELS


def test_labels_agree_with_diseases(diseases: list[dict[str, Any]]) -> None:
    from_data: dict[str, list[str]] = {}
    for disease in diseases:
        from_data.setdefault(disease["plant"], []).append(disease["slug"])
    expected = {slug: sorted(from_data.get(slug, [])) for slug in GOLDEN_LABELS["plants"]}
    assert expected == GOLDEN_LABELS["plants"]
    assert sum(len(v) for v in GOLDEN_LABELS["plants"].values()) == 27


def test_every_disease_has_all_three_entry_kinds(diseases: list[dict[str, Any]]) -> None:
    entries = _load("entries.json")
    kinds = {(e["plant"], e["disease"], e["kind"]) for e in entries}
    for disease in diseases:
        for kind in ("symptom", "treatment", "prevention"):
            assert (disease["plant"], disease["slug"], kind) in kinds


def test_entries_are_short_ordered_and_unique() -> None:
    entries = _load("entries.json")
    assert all(0 < len(e["text"]) <= 250 for e in entries)
    grouped: dict[tuple[str, str, str], list[dict[str, Any]]] = {}
    for entry in entries:
        grouped.setdefault((entry["plant"], entry["disease"], entry["kind"]), []).append(entry)
    for items in grouped.values():
        assert [i["position"] for i in items] == list(range(1, len(items) + 1))
        texts = [i["text"].lower() for i in items]
        assert len(set(texts)) == len(texts)


def test_affected_species_reference_real_diseases(diseases: list[dict[str, Any]]) -> None:
    pairs = {(d["plant"], d["slug"]) for d in diseases}
    species = _load("affected_species.json")
    assert species
    assert {(s["plant"], s["disease"]) for s in species} <= pairs


def test_alias_targets_exist_and_do_not_shadow_canonical_slugs() -> None:
    config = load_config()
    plants = GOLDEN_LABELS["plants"]
    assert set(config.plant_aliases.values()) <= set(plants)
    assert not set(config.plant_aliases) & set(plants) - set(config.plant_aliases.values())
    for plant, aliases in config.disease_aliases.items():
        assert set(aliases.values()) <= set(plants[plant])
        assert not set(aliases) & (set(plants[plant]) - set(aliases.values()))


def test_plant_photos_exist_and_fit_budget(plants: list[dict[str, Any]]) -> None:
    for plant in plants:
        photo = SEEDS / plant["photo"]
        assert photo.is_file(), plant["slug"]
        with Image.open(photo) as image:
            assert image.format == "JPEG"
            assert max(image.size) <= 1280
        assert plant["photo_alt"]
    assert not (SEEDS / "plant_photos" / "raspberry.jpg").exists()


def test_image_records_point_at_files_with_matching_hashes(diseases: list[dict[str, Any]]) -> None:
    pairs = {(d["plant"], d["slug"]) for d in diseases}
    for record in _load("images.json"):
        assert (record["plant"], record["disease"]) in pairs
        data = (SEEDS / record["key"]).read_bytes()
        assert hashlib.sha256(data).hexdigest() == record["sha256"]
        assert record["key"].endswith(f"/{record['sha256'][:12]}.jpg")
        assert record["alt"]
        with Image.open(BytesIO(data)) as image:
            assert max(image.size) <= 1280


def test_committed_image_coverage_is_never_silently_empty() -> None:
    images = _load("images.json")
    samples = _load("verdict_samples.json")
    report = (SEEDS / "cleaning_report.md").read_text(encoding="utf-8")
    if images and samples:
        assert "## Open items" not in report
        return
    assert "## Open items" in report, "empty image seed must be listed as an open item"
    pytest.skip(
        f"OPEN ITEM: seed has {len(images)} disease images and {len(samples)} verdict "
        "samples (the dump blobs are corrupt); see cleaning_report.md"
    )


def test_committed_data_passes_the_hyphen_lint() -> None:
    assert lint_seed_data(DATA) == []


def test_cleaning_report_is_committed() -> None:
    report = (SEEDS / "cleaning_report.md").read_text(encoding="utf-8")
    assert report.startswith("# Seed cleaning report")
    assert "| Plants | 13 |" in report
    assert "| Diseases | 27 |" in report


def test_ml_integration_doc_lists_every_valid_slug() -> None:
    doc = (SEEDS.parents[2] / "docs" / "ML_INTEGRATION.md").read_text(encoding="utf-8")
    for plant, disease_slugs in GOLDEN_LABELS["plants"].items():
        assert f"| {plant} |" in doc
        for slug in disease_slugs:
            assert slug in doc
    for needle in ("predict(self, image: bytes)", "ML_SERVICE=", "confidence", "FakeMLService"):
        assert needle in doc


DAHON_DUMP = SEEDS.parents[2] / "DAHON-main/DAHON-main/app/backend/Database/init (1).sql"
DAHON_PLANTS = SEEDS.parents[2] / "DAHON-main/DAHON-main/app/frontend/assets/plant"


@pytest.mark.skipif(not DAHON_DUMP.exists(), reason="DAHON dump is not available")
def test_committed_data_matches_a_fresh_extraction(tmp_path: Path) -> None:
    from tools.extract_dahon import run_extraction

    catalog, _ = run_extraction(DAHON_DUMP, DAHON_PLANTS, tmp_path, load_config())
    assert (len(catalog.plants), len(catalog.diseases)) == (13, 27)
    for name in ("plants", "diseases", "entries", "affected_species", "images"):
        fresh = json.loads((tmp_path / "data" / f"{name}.json").read_text(encoding="utf-8"))
        assert fresh == _load(f"{name}.json"), name
    committed_labels = json.loads((SEEDS / "labels.json").read_text(encoding="utf-8"))
    assert json.loads((tmp_path / "labels.json").read_text(encoding="utf-8")) == committed_labels
