"""Typed loader for ``app/seeds/slug_overrides.yaml``."""

from __future__ import annotations

import importlib
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

yaml: Any = importlib.import_module("yaml")  # PyYAML ships without type stubs here
DEFAULT_CONFIG_PATH = Path(__file__).resolve().parents[1] / "app" / "seeds" / "slug_overrides.yaml"


class ConfigError(ValueError):
    """The overrides file is missing a section or has the wrong shape."""


@dataclass(frozen=True)
class PlantNames:
    slug: str
    name: str


@dataclass(frozen=True)
class DiseaseOverride:
    slug: str | None = None
    name: str | None = None
    display_name: str | None = None


@dataclass(frozen=True)
class SeedConfig:
    drop_plants: frozenset[str]
    drop_diseases: frozenset[str]
    display_name_max: int
    text_fixes: tuple[tuple[str, str], ...]
    plants: Mapping[str, PlantNames]
    prefix_to_plant: Mapping[str, str]
    diseases: Mapping[str, DiseaseOverride]
    plant_photos: Mapping[str, str]
    ignored_plant_photos: frozenset[str]
    plant_aliases: Mapping[str, str] = field(default_factory=dict)
    disease_aliases: Mapping[str, Mapping[str, str]] = field(default_factory=dict)


def _section(data: Mapping[str, Any], key: str) -> Any:
    if key not in data:
        raise ConfigError(f"slug_overrides.yaml is missing '{key}'")
    return data[key]


def parse_config(raw: Mapping[str, Any]) -> SeedConfig:
    source = _section(raw, "source")
    plants = {
        name: PlantNames(slug=str(entry["slug"]), name=str(entry["name"]))
        for name, entry in (source.get("plants") or {}).items()
    }
    diseases = {
        key: DiseaseOverride(
            slug=entry.get("slug"),
            name=entry.get("name"),
            display_name=entry.get("display_name"),
        )
        for key, entry in (source.get("diseases") or {}).items()
    }
    return SeedConfig(
        drop_plants=frozenset(source.get("drop_plants") or ()),
        drop_diseases=frozenset(source.get("drop_diseases") or ()),
        display_name_max=int(_section(source, "display_name_max")),
        text_fixes=tuple((str(k), str(v)) for k, v in (source.get("text_fixes") or {}).items()),
        plants=plants,
        prefix_to_plant=dict(_section(source, "prefix_to_plant")),
        diseases=diseases,
        plant_photos=dict(_section(source, "plant_photos")),
        ignored_plant_photos=frozenset(source.get("ignored_plant_photos") or ()),
        plant_aliases=dict(raw.get("plant_aliases") or {}),
        disease_aliases={k: dict(v) for k, v in (raw.get("disease_aliases") or {}).items()},
    )


def load_config(path: Path = DEFAULT_CONFIG_PATH) -> SeedConfig:
    with path.open(encoding="utf-8") as handle:
        raw = yaml.safe_load(handle)
    if not isinstance(raw, dict):
        raise ConfigError("slug_overrides.yaml must contain a mapping")
    return parse_config(raw)
