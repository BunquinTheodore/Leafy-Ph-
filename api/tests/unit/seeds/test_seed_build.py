from __future__ import annotations

import pytest
from tools.seed_build import CatalogError, RawTables, build_catalog, build_labels
from tools.seed_config import SeedConfig, parse_config

BAD = "\ufffd"


def _config(**source_overrides: object) -> SeedConfig:
    source: dict[str, object] = {
        "drop_plants": ["Unknown"],
        "drop_diseases": ["Healthy", "Unknown"],
        "display_name_max": 24,
        "text_fixes": {"Haunglongbing": "Huanglongbing"},
        "plants": {"Pepper Bell": {"slug": "bell-pepper", "name": "Bell Pepper"}},
        "prefix_to_plant": {"Tomato": "tomato", "Bell Pepper": "bell-pepper"},
        "diseases": {},
        "plant_photos": {},
    }
    source.update(source_overrides)
    return parse_config({"source": source})


def _tables(**overrides: list[tuple[object, ...]]) -> RawTables:
    base: dict[str, list[tuple[object, ...]]] = {
        "plant": [
            (2, "Tomato", "Solanum lycopersicum", "Solanaceae", "Fruit"),
            (8, "Pepper Bell", "Capsicum annuum", "Solanaceae", "Fruit"),
            (34, "Unknown", "Unknown species", "Unknown family", "Unknown type"),
        ],
        "growth_condition": [
            (1, 2, "Loam", "Full sun", "Regular", f"70{BAD}85{BAD}F"),
            (2, 8, "Loam", "Full sun", "Regular", "Warm"),
            (3, 34, "Undetermined", "Undetermined", "Undetermined", "Undetermined"),
        ],
        "disease": [
            (1, "Tomato: Early Blight", "Fungal (Alternaria solani)", "Moderate to severe, wet"),
            (2, "Bell Pepper: Bacterial Spot", "Bacterial (Xanthomonas campestris)", "High; loss"),
            (3, "Healthy", "None detected", "None"),
            (4, "Unknown", "Cause undetermined", "Severity undetermined"),
        ],
        "symptom": [
            (1, 1, "Dark spots on old leaves"),
            (2, 1, "Rings form. Leaves yellow."),
            (3, 3, "No visible signs"),
        ],
        "treatment": [(1, 1, "Apply fungicide"), (2, 1, "Remove debris"), (3, 4, "Pending")],
        "prevention": [
            (1, 1, "Remove debris."),
            (2, 1, "Rotate crops"),
            (3, 1, "Rotate crops."),
        ],
        "species_affected": [(1, 1, "Solanum lycopersicum"), (2, 1, "Solanum lycopersicum")],
    }
    base.update(overrides)
    return RawTables(**base)  # type: ignore[arg-type]


def test_plants_drop_unknown_and_apply_name_overrides() -> None:
    catalog = build_catalog(_tables(), _config())
    slugs = [plant["slug"] for plant in catalog.plants]
    assert slugs == ["bell-pepper", "tomato"]
    pepper = catalog.plants[0]
    assert pepper["name"] == "Bell Pepper"
    assert pepper["scientific_name"] == "Capsicum annuum"


def test_growth_conditions_are_merged_and_cleaned() -> None:
    catalog = build_catalog(_tables(), _config())
    tomato = next(p for p in catalog.plants if p["slug"] == "tomato")
    assert tomato["soil_type"] == "Loam"
    assert tomato["temperature"] == "70 to 85\u00b0F"


def test_plant_without_growth_condition_is_a_hard_failure() -> None:
    with pytest.raises(CatalogError, match="growth"):
        build_catalog(_tables(growth_condition=[]), _config())


def test_diseases_split_prefix_and_drop_pseudo_entries() -> None:
    catalog = build_catalog(_tables(), _config())
    assert [(d["plant"], d["slug"]) for d in catalog.diseases] == [
        ("bell-pepper", "bacterial-spot"),
        ("tomato", "early-blight"),
    ]
    blight = catalog.diseases[1]
    assert blight["pathogen_type"] == "fungal"
    assert blight["pathogen_name"] == "Alternaria solani"
    assert blight["severity_level"] == "severe"
    assert blight["name"] == "Early Blight"
    assert blight["display_name"] == "Early Blight"


def test_unmapped_prefix_is_a_hard_failure() -> None:
    rows = [(1, "Mango: Anthracnose", "Fungal (Colletotrichum gloeosporioides)", "High")]
    with pytest.raises(CatalogError, match="Mango"):
        build_catalog(_tables(disease=rows), _config())


def test_disease_without_prefix_separator_is_a_hard_failure() -> None:
    rows = [(1, "Mystery", "Fungal (Alternaria solani)", "High")]
    with pytest.raises(CatalogError, match="Mystery"):
        build_catalog(_tables(disease=rows), _config())


def test_text_fixes_correct_the_haunglongbing_typo() -> None:
    config = _config(
        prefix_to_plant={"Tomato": "tomato"},
        diseases={"tomato/Huanglongbing (Citrus Greening)": {"display_name": "Citrus Greening"}},
    )
    rows = [(1, "Tomato: Haunglongbing (Citrus Greening)", "Bacterial (Candidatus L)", "High")]
    catalog = build_catalog(
        _tables(disease=rows, symptom=[], treatment=[], prevention=[], species_affected=[]), config
    )
    assert catalog.diseases[0]["name"] == "Huanglongbing (Citrus Greening)"
    assert catalog.diseases[0]["slug"] == "huanglongbing-citrus-greening"


def test_long_name_requires_a_display_name_override() -> None:
    rows = [(1, "Tomato: Tomato Yellow Leaf Curl Virus", "Viral (TYLCV)", "Severe")]
    tables = _tables(disease=rows, symptom=[], treatment=[], prevention=[], species_affected=[])
    with pytest.raises(CatalogError, match="display_name"):
        build_catalog(tables, _config())
    config = _config(
        diseases={
            "tomato/Tomato Yellow Leaf Curl Virus": {"display_name": "Yellow Leaf Curl Virus"}
        }
    )
    catalog = build_catalog(tables, config)
    assert catalog.diseases[0]["display_name"] == "Yellow Leaf Curl Virus"


def test_slug_collision_within_a_plant_is_a_hard_failure() -> None:
    rows = [
        (1, "Tomato: Early Blight", "Fungal (Alternaria solani)", "High"),
        (2, "Tomato: Early  blight", "Fungal (Alternaria solani)", "High"),
    ]
    tables = _tables(disease=rows, symptom=[], treatment=[], prevention=[], species_affected=[])
    with pytest.raises(CatalogError, match="collision"):
        build_catalog(tables, _config())


def test_entries_are_ordered_split_and_deduped_per_kind() -> None:
    catalog = build_catalog(_tables(), _config())
    symptoms = [e for e in catalog.entries if e["kind"] == "symptom"]
    assert [(e["position"], e["text"]) for e in symptoms] == [
        (1, "Dark spots on old leaves"),
        (2, "Rings form"),
        (3, "Leaves yellow"),
    ]
    prevention = [e["text"] for e in catalog.entries if e["kind"] == "prevention"]
    assert prevention == ["Remove debris", "Rotate crops"]
    assert all(e["plant"] == "tomato" and e["disease"] == "early-blight" for e in catalog.entries)


def test_cross_kind_duplicates_are_reported_not_deleted() -> None:
    catalog = build_catalog(_tables(), _config())
    treatment = [e["text"] for e in catalog.entries if e["kind"] == "treatment"]
    assert "Remove debris" in treatment
    assert any("Remove debris" in note for note in catalog.report.cross_kind_duplicates)


def test_entries_of_dropped_diseases_are_ignored_but_unknown_ids_fail() -> None:
    build_catalog(_tables(), _config())
    with pytest.raises(CatalogError, match="99"):
        build_catalog(_tables(symptom=[(1, 99, "orphan")]), _config())


def test_species_are_deduped_and_positioned() -> None:
    catalog = build_catalog(_tables(), _config())
    assert catalog.species == [
        {
            "plant": "tomato",
            "disease": "early-blight",
            "species": "Solanum lycopersicum",
            "position": 1,
        }
    ]


def test_labels_list_every_plant_including_those_without_diseases() -> None:
    rows = [
        *_tables().plant,
        (4, "Blueberry", "Vaccinium", "Ericaceae", "Fruit"),
    ]
    growth = [*_tables().growth_condition, (4, 4, "Acidic", "Sun", "Moist", "Cool")]
    catalog = build_catalog(_tables(plant=rows, growth_condition=growth), _config())
    labels = build_labels(catalog)
    assert labels["plants"]["blueberry"] == []
    assert labels["plants"]["tomato"] == ["early-blight"]
    assert labels["reserved"] == {"healthy": "healthy", "unknown": "unknown"}
