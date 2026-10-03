"""Pure transformation of raw dump tables into the Leafy seed catalog.

No file or database access happens here: ``build_catalog`` takes parsed rows
and returns plain JSON ready dictionaries plus a report of every change made.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from tools.mysql_dump import Row, as_int
from tools.seed_config import DiseaseOverride, SeedConfig
from tools.seed_text import (
    REPLACEMENT,
    clean_text,
    dedupe_keep_order,
    parse_pathogen,
    severity_level,
    slugify,
    split_items,
)

ENTRY_KINDS = ("symptom", "treatment", "prevention")
LONG_ITEM_CHARS = 160
PLANT_FIELDS = ("soil_type", "light", "water_needs", "temperature")

Record = dict[str, Any]


class CatalogError(ValueError):
    """The dump content cannot be turned into a valid catalog."""


@dataclass(frozen=True)
class RawTables:
    plant: Sequence[Row]
    growth_condition: Sequence[Row]
    disease: Sequence[Row]
    symptom: Sequence[Row]
    treatment: Sequence[Row]
    prevention: Sequence[Row]
    species_affected: Sequence[Row]


@dataclass(frozen=True)
class BuildReport:
    dropped_plants: tuple[str, ...]
    dropped_diseases: tuple[str, ...]
    text_repairs: tuple[tuple[str, str], ...]
    typo_fixes: tuple[str, ...]
    in_kind_duplicates: tuple[str, ...]
    cross_kind_duplicates: tuple[str, ...]
    split_rows: int
    long_items: tuple[str, ...]
    pathogen_notes: tuple[str, ...]


@dataclass(frozen=True)
class Catalog:
    plants: list[Record]
    diseases: list[Record]
    entries: list[Record]
    species: list[Record]
    report: BuildReport
    dropped_disease_ids: frozenset[int]
    disease_ids: dict[int, tuple[str, str]]


class _Cleaner:
    """Applies configured typo fixes and clean_text, remembering what changed."""

    def __init__(self, config: SeedConfig) -> None:
        self._fixes = config.text_fixes
        self.repairs: dict[str, str] = {}
        self.typos: list[str] = []

    def __call__(self, raw: object) -> str:
        text = str(raw)
        for wrong, right in self._fixes:
            if wrong in text:
                self.typos.append(f"{wrong} -> {right}: {text[:70]}")
                text = text.replace(wrong, right)
        cleaned = clean_text(text)
        if REPLACEMENT in text and text not in self.repairs:
            self.repairs[text] = cleaned
        return cleaned


def _build_plants(
    tables: RawTables, config: SeedConfig, clean: _Cleaner
) -> tuple[list[Record], dict[int, str], list[str]]:
    growth = {as_int(row[1]): row for row in tables.growth_condition}
    plants: list[Record] = []
    ids: dict[int, str] = {}
    dropped: list[str] = []
    for row in tables.plant:
        plant_id, common = as_int(row[0]), str(row[1])
        if common in config.drop_plants:
            dropped.append(common)
            continue
        names = config.plants.get(common)
        slug = names.slug if names else slugify(common)
        name = names.name if names else clean(common)
        if plant_id not in growth:
            raise CatalogError(f"plant {name!r} has no growth condition row")
        fields = dict(zip(PLANT_FIELDS, (clean(v) for v in growth[plant_id][2:6]), strict=True))
        plants.append(
            {
                "slug": slug,
                "name": name,
                "scientific_name": clean(row[2]),
                "family": clean(row[3]),
                "type": clean(row[4]),
                **fields,
                "photo": None,
                "photo_alt": f"{name} plant in the field",
            }
        )
        ids[plant_id] = slug
    slugs = [p["slug"] for p in plants]
    if len(set(slugs)) != len(slugs):
        raise CatalogError("plant slug collision")
    return sorted(plants, key=lambda p: p["slug"]), ids, dropped


def _split_prefix(raw_name: str) -> tuple[str, str]:
    prefix, separator, rest = raw_name.partition(": ")
    if not separator or not rest.strip():
        raise CatalogError(f"disease name {raw_name!r} is not in 'Plant: Disease' form")
    return prefix.strip(), rest.strip()


def _disease_names(
    plant_slug: str, rest: str, override: DiseaseOverride | None, config: SeedConfig
) -> tuple[str, str, str]:
    name = override.name if override and override.name else rest
    slug = override.slug if override and override.slug else slugify(name)
    display = override.display_name if override and override.display_name else name
    if len(display) > config.display_name_max:
        raise CatalogError(
            f"disease {plant_slug}/{rest!r} needs a short display_name "
            f"(over {config.display_name_max} characters) in slug_overrides.yaml"
        )
    return slug, name, display


def _pathogen_note(slug: str, cause: str, kind: str, name: str) -> str | None:
    if cause.lower().startswith("fungal") and kind == "oomycete":
        return f"{slug}: source says fungal, normalized to oomycete because {name} is an oomycete"
    return None


def _build_diseases(
    tables: RawTables,
    config: SeedConfig,
    plant_slugs: set[str],
    clean: _Cleaner,
) -> tuple[list[Record], dict[int, tuple[str, str]], frozenset[int], list[str], list[str]]:
    diseases: list[Record] = []
    ids: dict[int, tuple[str, str]] = {}
    dropped_ids: set[int] = set()
    dropped_names: list[str] = []
    notes: list[str] = []
    for row in sorted(tables.disease, key=lambda r: as_int(r[0])):
        disease_id, raw_name = as_int(row[0]), str(row[1])
        if raw_name in config.drop_diseases:
            dropped_ids.add(disease_id)
            dropped_names.append(raw_name)
            continue
        prefix, rest = _split_prefix(clean(raw_name))
        plant_slug = config.prefix_to_plant.get(prefix)
        if plant_slug is None or plant_slug not in plant_slugs:
            raise CatalogError(f"disease {raw_name!r}: unmapped plant prefix {prefix!r}")
        override = config.diseases.get(f"{plant_slug}/{rest}")
        slug, name, display = _disease_names(plant_slug, rest, override, config)
        cause = clean(row[2])
        kind, pathogen = parse_pathogen(cause)
        note = _pathogen_note(f"{plant_slug}/{slug}", cause, kind, pathogen)
        notes.extend([note] if note else [])
        severity = clean(row[3])
        diseases.append(
            {
                "plant": plant_slug,
                "slug": slug,
                "name": name,
                "display_name": display,
                "cause": cause,
                "pathogen_type": kind,
                "pathogen_name": pathogen,
                "severity": severity,
                "severity_level": severity_level(severity),
            }
        )
        ids[disease_id] = (plant_slug, slug)
    return diseases, ids, frozenset(dropped_ids), dropped_names, notes


def _check_slug_collisions(diseases: list[Record]) -> None:
    seen: set[tuple[str, str]] = set()
    for disease in diseases:
        key = (disease["plant"], disease["slug"])
        if key in seen:
            raise CatalogError(f"disease slug collision: {key[0]}/{key[1]}")
        seen.add(key)


def _resolve(
    table: str,
    disease_id: int,
    ids: dict[int, tuple[str, str]],
    dropped: frozenset[int],
) -> tuple[str, str] | None:
    if disease_id in dropped:
        return None
    if disease_id not in ids:
        raise CatalogError(f"{table} row references unknown disease id {disease_id}")
    return ids[disease_id]


def _build_entries(
    tables: RawTables,
    ids: dict[int, tuple[str, str]],
    dropped: frozenset[int],
    clean: _Cleaner,
) -> tuple[list[Record], list[str], list[str], int, list[str]]:
    texts: dict[tuple[str, str, str], list[str]] = defaultdict(list)
    split_rows = 0
    for kind in ENTRY_KINDS:
        rows = sorted(getattr(tables, kind), key=lambda r: as_int(r[0]))
        for row in rows:
            target = _resolve(kind, as_int(row[1]), ids, dropped)
            if target is None:
                continue
            items = split_items(clean(row[2]))
            split_rows += len(items) > 1
            texts[(*target, kind)].extend(items)
    entries: list[Record] = []
    duplicates: list[str] = []
    long_items: list[str] = []
    for (plant, disease, kind), items in sorted(texts.items(), key=_entry_order):
        unique = dedupe_keep_order(items)
        duplicates.extend(
            f"{plant}/{disease} {kind}: duplicate removed" for _ in range(len(items) - len(unique))
        )
        for position, text in enumerate(unique, start=1):
            entries.append(
                {
                    "plant": plant,
                    "disease": disease,
                    "kind": kind,
                    "position": position,
                    "text": text,
                }
            )
            if len(text) > LONG_ITEM_CHARS:
                long_items.append(f"{plant}/{disease} {kind} #{position}: {len(text)} characters")
    return entries, duplicates, _cross_kind(entries), split_rows, long_items


def _entry_order(item: tuple[tuple[str, str, str], list[str]]) -> tuple[str, str, int]:
    (plant, disease, kind), _ = item
    return plant, disease, ENTRY_KINDS.index(kind)


def _cross_kind(entries: list[Record]) -> list[str]:
    by_key: dict[tuple[str, str], dict[str, str]] = defaultdict(dict)
    for entry in entries:
        key = (entry["plant"], entry["disease"])
        by_key[key].setdefault(entry["text"].lower(), entry["kind"])
    notes: list[str] = []
    for entry in entries:
        key = (entry["plant"], entry["disease"])
        first_kind = by_key[key][entry["text"].lower()]
        if first_kind != entry["kind"]:
            notes.append(
                f"{key[0]}/{key[1]}: {entry['text']!r} appears under both "
                f"{first_kind} and {entry['kind']}"
            )
    return notes


def _build_species(
    tables: RawTables,
    ids: dict[int, tuple[str, str]],
    dropped: frozenset[int],
    clean: _Cleaner,
) -> list[Record]:
    grouped: dict[tuple[str, str], list[str]] = defaultdict(list)
    for row in sorted(tables.species_affected, key=lambda r: as_int(r[0])):
        target = _resolve("species_affected", as_int(row[1]), ids, dropped)
        if target is not None:
            grouped[target].append(clean(row[2]))
    return [
        {"plant": plant, "disease": disease, "species": species, "position": position}
        for (plant, disease), items in sorted(grouped.items())
        for position, species in enumerate(dedupe_keep_order(items), start=1)
    ]


def build_catalog(tables: RawTables, config: SeedConfig) -> Catalog:
    """Build plants, diseases, entries and affected species from raw dump rows."""
    clean = _Cleaner(config)
    plants, _plant_ids, dropped_plants = _build_plants(tables, config, clean)
    diseases, ids, dropped_ids, dropped_diseases, notes = _build_diseases(
        tables, config, {p["slug"] for p in plants}, clean
    )
    _check_slug_collisions(diseases)
    entries, in_kind, cross_kind, split_rows, long_items = _build_entries(
        tables, ids, dropped_ids, clean
    )
    species = _build_species(tables, ids, dropped_ids, clean)
    report = BuildReport(
        dropped_plants=tuple(dropped_plants),
        dropped_diseases=tuple(dropped_diseases),
        text_repairs=tuple(clean.repairs.items()),
        typo_fixes=tuple(dict.fromkeys(clean.typos)),
        in_kind_duplicates=tuple(in_kind),
        cross_kind_duplicates=tuple(cross_kind),
        split_rows=split_rows,
        long_items=tuple(long_items),
        pathogen_notes=tuple(notes),
    )
    ordered = sorted(diseases, key=lambda d: (d["plant"], d["slug"]))
    positioned = [{**d, "position": i} for i, d in enumerate(ordered, start=1)]
    return Catalog(plants, positioned, entries, species, report, dropped_ids, ids)


def build_labels(catalog: Catalog) -> Record:
    """The labels.json contract: plant slug to disease slugs, plus reserved verdicts."""
    plants: dict[str, list[str]] = {p["slug"]: [] for p in catalog.plants}
    for disease in catalog.diseases:
        plants[disease["plant"]].append(disease["slug"])
    return {
        "version": 1,
        "reserved": {"healthy": "healthy", "unknown": "unknown"},
        "plants": {slug: sorted(slugs) for slug, slugs in sorted(plants.items())},
    }
