"""Seed image ingestion: disease samples, healthy/unknown samples and plant photos."""

from __future__ import annotations

from collections.abc import Iterable, Iterator, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from tools.mysql_dump import Row, as_int
from tools.seed_build import CatalogError, Record
from tools.seed_config import SeedConfig
from tools.seed_images import ImageRejectedError, corruption_ratio, process_image

DISEASE_IMAGES_DIR = "images"
VERDICT_SAMPLES_DIR = "verdict_samples"
PLANT_PHOTOS_DIR = "plant_photos"
VERDICTS = ("healthy", "unknown")
KEY_HASH_CHARS = 12
IMAGE_SUFFIXES = frozenset({".jpg", ".jpeg", ".png", ".webp"})


@dataclass(frozen=True)
class ImageTarget:
    """Where an image belongs: a disease, or a verdict screen sample."""

    verdict: str | None = None
    plant: str | None = None
    disease: str | None = None

    @property
    def label(self) -> str:
        return self.verdict or f"{self.plant}/{self.disease}"


@dataclass(frozen=True)
class SourceImage:
    target: ImageTarget
    source: str
    data: bytes


@dataclass(frozen=True)
class RejectedImage:
    target: str
    source: str
    reason: str
    corruption: float


@dataclass(frozen=True)
class MediaResult:
    images: list[Record]
    verdict_samples: list[Record]
    rejected: list[RejectedImage]
    duplicates: list[str]


def _alt_text(target: ImageTarget, names: Mapping[str, str], index: int) -> str:
    if target.verdict == "healthy":
        return f"Healthy leaf sample {index}"
    if target.verdict == "unknown":
        return f"Leaf sample that could not be identified, example {index}"
    plant = names[f"plant:{target.plant}"]
    disease = names[f"disease:{target.plant}/{target.disease}"]
    return f"{plant} leaf showing {disease}, example {index}"


def _relative_key(target: ImageTarget, digest: str) -> str:
    name = f"{digest[:KEY_HASH_CHARS]}.jpg"
    if target.verdict:
        return f"{VERDICT_SAMPLES_DIR}/{target.verdict}/{name}"
    return f"{DISEASE_IMAGES_DIR}/{target.plant}/{target.disease}/{name}"


def ingest_images(
    sources: Iterable[SourceImage], out_dir: Path, names: Mapping[str, str]
) -> MediaResult:
    """Sniff, normalize, dedupe by sha256 and write every usable image."""
    images: list[Record] = []
    verdicts: list[Record] = []
    rejected: list[RejectedImage] = []
    duplicates: list[str] = []
    seen: set[tuple[str, str]] = set()
    counts: dict[str, int] = {}
    for item in sources:
        try:
            processed = process_image(item.data)
        except ImageRejectedError as exc:
            rejected.append(
                RejectedImage(item.target.label, item.source, str(exc), corruption_ratio(item.data))
            )
            continue
        marker = (item.target.label, processed.sha256)
        if marker in seen:
            duplicates.append(f"{item.target.label}: {item.source} duplicates an earlier image")
            continue
        seen.add(marker)
        index = counts[item.target.label] = counts.get(item.target.label, 0) + 1
        key = _relative_key(item.target, processed.sha256)
        destination = out_dir / key
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(processed.data)
        record: Record = {
            "key": key,
            "sha256": processed.sha256,
            "width": processed.width,
            "height": processed.height,
            "bytes": len(processed.data),
            "alt": _alt_text(item.target, names, index),
            "source": item.source,
            "position": index,
        }
        if item.target.verdict:
            verdicts.append({"verdict": item.target.verdict, **record})
        else:
            images.append({"plant": item.target.plant, "disease": item.target.disease, **record})
    return MediaResult(images, verdicts, rejected, duplicates)


def iter_dump_images(
    rows: Iterable[Row],
    disease_ids: Mapping[int, tuple[str, str]],
    verdict_ids: Mapping[int, str],
) -> Iterator[SourceImage]:
    """Turn ``sample_image`` rows (id, filename, diseaseID, blob, mime) into sources."""
    for row in rows:
        row_id, disease_id = as_int(row[0]), as_int(row[2])
        filename, blob = row[1], row[3]
        if not isinstance(blob, bytes):
            raise CatalogError(f"sample_image row {row_id} has no image bytes")
        if disease_id in verdict_ids:
            target = ImageTarget(verdict=verdict_ids[disease_id])
        elif disease_id in disease_ids:
            plant, disease = disease_ids[disease_id]
            target = ImageTarget(plant=plant, disease=disease)
        else:
            raise CatalogError(f"sample_image row {row_id} references unknown disease {disease_id}")
        yield SourceImage(target, f"dump:{row_id}:{filename!s}", blob)


def iter_directory_images(root: Path, valid: set[tuple[str, str]]) -> Iterator[SourceImage]:
    """Replacement images laid out as ``<plant>/<disease>/*`` plus ``_healthy`` and ``_unknown``."""
    for directory in sorted(p for p in root.rglob("*") if p.is_dir()):
        relative = directory.relative_to(root).parts
        files = sorted(f for f in directory.iterdir() if f.suffix.lower() in IMAGE_SUFFIXES)
        if not files:
            continue
        if len(relative) == 1 and relative[0].lstrip("_") in VERDICTS:
            target = ImageTarget(verdict=relative[0].lstrip("_"))
        elif len(relative) == 2 and (relative[0], relative[1]) in valid:
            target = ImageTarget(plant=relative[0], disease=relative[1])
        else:
            raise CatalogError(
                f"extra images folder {'/'.join(relative)!r} matches no catalog item"
            )
        for file in files:
            yield SourceImage(
                target, f"extra:{'/'.join((*relative, file.name))}", file.read_bytes()
            )


def build_plant_photos(
    plants: list[Record], plants_dir: Path, config: SeedConfig, out_dir: Path
) -> tuple[list[Record], list[str]]:
    """Resize plant photos into ``plant_photos/<slug>.jpg`` and attach them to plants."""
    known = set(config.plant_photos.values()) | set(config.ignored_plant_photos)
    present = {p.name for p in plants_dir.iterdir() if p.is_file()}
    stray = sorted(present - known)
    if stray:
        raise CatalogError(f"plant photos not listed in slug_overrides.yaml: {stray}")
    updated: list[Record] = []
    notes: list[str] = []
    for plant in plants:
        filename = config.plant_photos.get(plant["slug"])
        if filename is None or filename not in present:
            raise CatalogError(f"plant {plant['slug']!r} has no photo file {filename!r}")
        processed = process_image((plants_dir / filename).read_bytes())
        key = f"{PLANT_PHOTOS_DIR}/{plant['slug']}.jpg"
        (out_dir / key).parent.mkdir(parents=True, exist_ok=True)
        (out_dir / key).write_bytes(processed.data)
        updated.append({**plant, "photo": key})
        notes.append(
            f"{plant['slug']}: {filename} -> {key} ({processed.width}x{processed.height}, "
            f"{len(processed.data) // 1024} KB)"
        )
    ignored = sorted(config.ignored_plant_photos & present)
    notes.extend(f"ignored: {name}" for name in ignored)
    return updated, notes


def entity_names(catalog_plants: list[Record], catalog_diseases: list[Record]) -> dict[str, str]:
    """Lookup used for alt text: ``plant:<slug>`` and ``disease:<plant>/<slug>`` to names."""
    names: dict[str, Any] = {f"plant:{p['slug']}": p["name"] for p in catalog_plants}
    names.update({f"disease:{d['plant']}/{d['slug']}": d["name"] for d in catalog_diseases})
    return names
