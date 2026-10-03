from __future__ import annotations

import pytest
from tools.seed_text import (
    UnrepairedTextError,
    clean_text,
    dedupe_keep_order,
    find_text_problems,
    parse_pathogen,
    severity_level,
    slugify,
    split_items,
)

BAD = "\ufffd"


def test_slugify_handles_punctuation_and_case() -> None:
    assert slugify("Cherry (including sour)") == "cherry-including-sour"
    assert slugify("  Esca (Black Measles) ") == "esca-black-measles"
    assert slugify("Spider  Mites") == "spider-mites"


def test_clean_text_normalizes_nfc_and_whitespace() -> None:
    decomposed = "Cafe\u0301   au\u00a0lait\r\n  next"
    assert clean_text(decomposed) == "Caf\u00e9 au lait next"


def test_clean_text_removes_soft_hyphens_and_entity() -> None:
    assert clean_text("fungi\u00adcide and bacteri&shy;cide") == "fungicide and bactericide"


def test_clean_text_joins_line_break_hyphenation() -> None:
    assert clean_text("infec-\ntion spreads") == "infection spreads"
    assert clean_text("infec- \r\n tion") == "infection"


def test_clean_text_repairs_numeric_ranges_and_degrees() -> None:
    assert clean_text(f"pH 6.0{BAD}6.8") == "pH 6.0 to 6.8"
    assert clean_text(f"70{BAD}85{BAD}F (21{BAD}29{BAD}C)") == "70 to 85\u00b0F (21 to 29\u00b0C)"
    assert clean_text(f"up to 30{BAD}50% yield loss") == "up to 30 to 50% yield loss"


def test_clean_text_repairs_hybrid_sign_and_dashes() -> None:
    assert clean_text(f"Fragaria {BAD} ananassa") == "Fragaria \u00d7 ananassa"
    assert clean_text(f"Severe {BAD} can result in loss") == "Severe; can result in loss"
    assert clean_text(f"strict sanitation{BAD}remove plants") == "strict sanitation, remove plants"


def test_clean_text_repairs_paired_quotes() -> None:
    cleaned = clean_text(f"(e.g., {BAD}Tygress{BAD}, {BAD}BHN 444{BAD})")
    assert cleaned == "(e.g., \u201cTygress\u201d, \u201cBHN 444\u201d)"


def test_clean_text_converts_single_quoted_phrases() -> None:
    assert (
        clean_text("a 'bullseye' pattern, it's fine") == "a \u201cbullseye\u201d pattern, it's fine"
    )


def test_clean_text_raises_on_unrepairable_replacement_char() -> None:
    with pytest.raises(UnrepairedTextError):
        clean_text(f"mystery {BAD}{BAD} text")


def test_split_items_splits_sentences_not_abbreviations() -> None:
    text = "Apply fungicides early. Rotate crops. Xanthomonas arboricola pv. pruni survives"
    assert split_items(text) == [
        "Apply fungicides early",
        "Rotate crops",
        "Xanthomonas arboricola pv. pruni survives",
    ]


def test_split_items_strips_trailing_period() -> None:
    assert split_items("Remove debris.") == ["Remove debris"]


def test_dedupe_keep_order_is_case_and_period_insensitive() -> None:
    items = ["Remove debris", "remove debris.", "Prune"]
    assert dedupe_keep_order(items) == ["Remove debris", "Prune"]


@pytest.mark.parametrize(
    ("cause", "expected"),
    [
        ("Fungal (Alternaria solani)", ("fungal", "Alternaria solani")),
        ("Viral (Tomato Mosaic Virus)", ("viral", "Tomato Mosaic Virus")),
        (
            "Virus (Tomato yellow leaf curl virus); transmitted by whiteflies",
            ("viral", "Tomato yellow leaf curl virus"),
        ),
        (
            "Pest (Tetranychus urticae or two-spotted spider mite)",
            ("pest", "Tetranychus urticae"),
        ),
        (
            "Soilborne oomycete pathogen Phytophthora capsici",
            ("oomycete", "Phytophthora capsici"),
        ),
        ("Fungal (Phytophthora infestans)", ("oomycete", "Phytophthora infestans")),
        (
            "Early blight is caused by the fungus Alternaria solani, which survives",
            ("fungal", "Alternaria solani"),
        ),
        (
            "The bacterium Xanthomonas arboricola pv. pruni survives in twig cankers",
            ("bacterial", "Xanthomonas arboricola pv. pruni"),
        ),
        (
            "Fungal infection primarily by Podosphaera xanthii and Erysiphe cichoracearum.",
            ("fungal", "Podosphaera xanthii and Erysiphe cichoracearum"),
        ),
    ],
)
def test_parse_pathogen(cause: str, expected: tuple[str, str]) -> None:
    assert parse_pathogen(cause) == expected


def test_parse_pathogen_unparseable_raises() -> None:
    with pytest.raises(ValueError, match="pathogen"):
        parse_pathogen("Cause undetermined")


@pytest.mark.parametrize(
    ("text", "level"),
    [
        ("Moderate to severe, especially in warm, wet climates", "severe"),
        ("Mild to moderate; can become severe under prolonged wet conditions", "moderate"),
        ("High; can cause complete crop loss", "high"),
        ("Can be severe if unmanaged", "severe"),
        ("Usually low to moderate; can become severe in susceptible hybrids", "moderate"),
        ("Moderate to High. Early blight can cause significant yield losses", "high"),
        ("Moderate; most damaging in humid climates", "moderate"),
    ],
)
def test_severity_level_uses_first_clause_max(text: str, level: str) -> None:
    assert severity_level(text) == level


def test_find_text_problems_flags_soft_hyphen_and_linebreak() -> None:
    assert find_text_problems("clean text") == []
    assert find_text_problems("soft\u00adhyphen")
    assert find_text_problems("&shy; entity")
    assert find_text_problems("infec-\ntion")
    assert find_text_problems("infec- tion")
    assert find_text_problems("replacement \ufffd char")


def test_find_text_problems_allows_suspended_hyphens() -> None:
    assert find_text_problems("at 5- to 7-day intervals") == []
    assert find_text_problems("pre- and post-harvest") == []


def test_clean_text_replaces_dashes_with_plain_wording() -> None:
    assert clean_text("pH 6.0\u20136.8") == "pH 6.0 to 6.8"
    assert clean_text("70\u201385\u00b0F") == "70 to 85\u00b0F"
    assert clean_text("Severe \u2013 can result in loss") == "Severe; can result in loss"
    assert clean_text("sanitation\u2014remove plants") == "sanitation, remove plants"
    assert clean_text("light-green leaves") == "light-green leaves"
