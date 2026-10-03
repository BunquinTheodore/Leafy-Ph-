"""Render ``cleaning_report.md`` from the extraction results."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass

from tools.seed_build import Catalog
from tools.seed_media import MediaResult


@dataclass(frozen=True)
class ReportInputs:
    catalog: Catalog
    media: MediaResult
    plant_photo_notes: list[str]
    dump_image_rows: int
    extra_images_used: bool


def _cell(text: str) -> str:
    return text.replace("|", "\\|").replace("\n", " ")


def _table(headers: tuple[str, ...], rows: Sequence[tuple[str, ...]]) -> list[str]:
    lines = ["| " + " | ".join(headers) + " |", "|" + "---|" * len(headers)]
    lines.extend("| " + " | ".join(_cell(c) for c in row) + " |" for row in rows)
    return [*lines, ""]


def _bullets(items: list[str] | tuple[str, ...], empty: str) -> list[str]:
    return [*(f"- {item}" for item in items), ""] if items else [empty, ""]


def _summary(data: ReportInputs) -> list[str]:
    c = data.catalog
    rows = [
        ("Plants", str(len(c.plants))),
        (
            "Plants with zero diseases",
            str(sum(not any(d["plant"] == p["slug"] for d in c.diseases) for p in c.plants)),
        ),
        ("Diseases", str(len(c.diseases))),
        ("Entries (symptom, treatment, prevention)", str(len(c.entries))),
        ("Affected species rows", str(len(c.species))),
        ("Disease images written", str(len(data.media.images))),
        ("Healthy and unknown samples written", str(len(data.media.verdict_samples))),
        ("Image rows seen in the dump", str(data.dump_image_rows)),
        ("Image rows rejected", str(len(data.media.rejected))),
    ]
    return ["## Summary", "", *_table(("Item", "Count"), rows)]


def _dropped(data: ReportInputs) -> list[str]:
    r = data.catalog.report
    return [
        "## Dropped rows",
        "",
        f"- Plants dropped: {', '.join(r.dropped_plants) or 'none'}",
        f"- Pseudo diseases dropped: {', '.join(r.dropped_diseases) or 'none'}",
        "- Raspberry is not seeded (a raspberry prediction resolves to `unknown`); "
        "its photo is ignored.",
        "- Blueberry and Soybean are seeded as plants with zero diseases.",
        "",
    ]


def _repairs(data: ReportInputs) -> list[str]:
    r = data.catalog.report
    lines = ["## Text repairs", ""]
    if r.text_repairs:
        lines += [
            "Some text columns arrived with lost characters (U+FFFD). Each field below was "
            "repaired from context by a fixed rule; a field no rule covers fails the extraction.",
            "",
            f"Fields repaired: {len(r.text_repairs)}",
            "",
            *_table(
                ("Before", "After"), [(a.replace("\ufffd", "<?>"), b) for a, b in r.text_repairs]
            ),
        ]
    else:
        lines += [
            "The text columns of this dump decoded cleanly (no U+FFFD), so no lost character "
            "repairs were needed. The repair rules stay in `tools/seed_text.py` and still fail "
            "loudly on any unrepairable text.",
            "",
        ]
    lines += [
        "Text normalization applied to every field: NFC, soft hyphens and `&shy;` removed, "
        "hyphens at line breaks joined, whitespace collapsed, straight single quoted phrases "
        'turned into typographic double quotes, numeric ranges written as "to", and dashes '
        "used as separators replaced by a semicolon or comma.",
        "",
        "### Typo fixes",
        "",
        *_bullets(r.typo_fixes, "None."),
    ]
    return lines


def _duplicates(data: ReportInputs) -> list[str]:
    r = data.catalog.report
    return [
        "## Duplicates",
        "",
        "### Removed (same kind, same disease)",
        "",
        *_bullets(r.in_kind_duplicates, "None."),
        "### Same text under two kinds (kept, needs manual review)",
        "",
        *_bullets(r.cross_kind_duplicates, "None."),
        f"Dump rows split into several short items: {r.split_rows}",
        "",
        "### Items longer than 160 characters",
        "",
        *_bullets(r.long_items, "None."),
    ]


def _diseases(data: ReportInputs) -> list[str]:
    rows = [
        (
            f"{d['plant']}/{d['slug']}",
            d["display_name"],
            d["pathogen_type"],
            d["pathogen_name"],
            d["severity_level"],
        )
        for d in data.catalog.diseases
    ]
    return [
        "## Diseases",
        "",
        "Disease slugs are unique per plant. `display_name` is the single line card title.",
        "",
        *_table(("Plant/slug", "Display name", "Pathogen type", "Pathogen", "Severity"), rows),
        "### Pathogen normalization",
        "",
        *_bullets(data.catalog.report.pathogen_notes, "None."),
    ]


def _images(data: ReportInputs) -> list[str]:
    media = data.media
    by_target: dict[str, list[float]] = defaultdict(list)
    for item in media.rejected:
        by_target[item.target].append(item.corruption)
    rows = [
        (target, str(len(ratios)), f"{sum(ratios) / len(ratios):.0%}")
        for target, ratios in sorted(by_target.items())
    ]
    lines = ["## Images", ""]
    if media.rejected:
        lines += [
            f"**{len(media.rejected)} of {data.dump_image_rows} image rows from the dump are "
            "unusable.** The blobs in the dump file contain U+FFFD replacement bytes (EF BF BD) "
            "where "
            "the original bytes of 0x80 or above were, so the JPEG and PNG data is destroyed "
            "(about a fifth of each image) and cannot be reconstructed. Re-export the "
            "table with `mysqldump --hex-blob`, or supply replacement images with "
            "`--extra-images` (see `api/tools/extract_dahon.py`).",
            "",
            *_table(("Target", "Rejected rows", "Bytes inside U+FFFD sequences"), rows),
        ]
    else:
        lines += ["Every image row decoded.", ""]
    lines += ["### Duplicates dropped", "", *_bullets(media.duplicates, "None.")]
    lines += ["### Plant photos", "", *_bullets(data.plant_photo_notes, "None.")]
    lines += [
        "### Provenance",
        "",
        "The origin and licensing of the DAHON sample and plant images is unknown. Check it "
        "before any public deploy.",
        "",
    ]
    return lines


def _open_items(data: ReportInputs) -> list[str]:
    media = data.media
    items = []
    if not media.images:
        items.append(
            "No disease reference images were seeded, so the disease Images panel and the "
            "Reference photos panel on scan results have nothing to show. Re-export the "
            "`sample_image` table with `mysqldump --hex-blob`, or supply images with "
            "`--extra-images`, then re-run the extraction."
        )
    if not media.verdict_samples:
        items.append(
            "No healthy or unknown verdict sample images were seeded, so those result "
            "screens have no reference photo. Same fix as above."
        )
    return ["## Open items", "", *_bullets(items, "None.")] if items else []


def render_report(data: ReportInputs) -> str:
    sections = [
        [
            "# Seed cleaning report",
            "",
            "Generated by `api/tools/extract_dahon.py`. Do not edit by hand.",
            "",
        ],
        _summary(data),
        _open_items(data),
        _dropped(data),
        _repairs(data),
        _duplicates(data),
        _diseases(data),
        _images(data),
    ]
    return "\n".join(line for section in sections for line in section).rstrip() + "\n"
