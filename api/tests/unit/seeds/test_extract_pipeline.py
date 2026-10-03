"""End to end run of the extraction on a tiny synthetic mysqldump."""

from __future__ import annotations

import json
from io import BytesIO
from pathlib import Path

import pytest
from PIL import Image
from tools.extract_dahon import ExpectedCounts, run_extraction
from tools.mysql_dump import DumpParseError
from tools.seed_build import CatalogError
from tools.seed_config import SeedConfig, parse_config
from tools.seed_images import sniff_image_type


def _image_bytes(fmt: str, color: tuple[int, int, int], size: tuple[int, int] = (64, 48)) -> bytes:
    buffer = BytesIO()
    Image.new("RGB", size, color).save(buffer, format=fmt)
    return buffer.getvalue()


def _hex(data: bytes) -> str:
    return "0x" + data.hex()


def _config() -> SeedConfig:
    return parse_config(
        {
            "source": {
                "drop_plants": ["Unknown"],
                "drop_diseases": ["Healthy", "Unknown"],
                "display_name_max": 24,
                "plants": {},
                "prefix_to_plant": {"Tomato": "tomato"},
                "diseases": {},
                "plant_photos": {"tomato": "tomato.jpg", "blueberry": "blueberry.jpg"},
                "ignored_plant_photos": ["raspberry.jpg"],
            }
        }
    )


def _write_dump(path: Path, png_as_jpg: bytes, jpeg: bytes) -> None:
    lossy = b"\xef\xbf\xbdPNG\r\n" + b"\xef\xbf\xbd" * 40
    lines = [
        "INSERT INTO `plant` VALUES (2,'Tomato','Solanum lycopersicum','Solanaceae','Fruit'),"
        "(4,'Blueberry','Vaccinium','Ericaceae','Fruit'),(34,'Unknown','x','y','z');",
        "INSERT INTO `growth_condition` VALUES (1,2,'Loam','Sun','Regular','Warm'),"
        "(2,4,'Acidic','Sun','Moist','Cool'),(3,34,'u','u','u','u');",
        "INSERT INTO `disease` VALUES (1,'Tomato: Early Blight','Fungal (Alternaria solani)',"
        "'High; loss'),(29,'Healthy','None','None'),(32,'Unknown','x','y');",
        "INSERT INTO `symptom` VALUES (1,1,'Dark spots. Yellow halo.');",
        "INSERT INTO `treatment` VALUES (1,1,'Apply fungicide');",
        "INSERT INTO `prevention` VALUES (1,1,'Rotate crops');",
        "INSERT INTO `species_affected` VALUES (1,1,'Solanum lycopersicum');",
    ]
    image_rows = [
        f"(1,'tomato-early-blight (1).jpg',1,{_hex(png_as_jpg)},'image/jpeg')",
        f"(2,'tomato-early-blight (2).jpg',1,{_hex(jpeg)},'image/jpeg')",
        f"(3,'tomato-early-blight (3).jpg',1,{_hex(jpeg)},'image/jpeg')",
        f"(4,'tomato-early-blight (4).jpg',1,{_hex(lossy)},'image/jpeg')",
        f"(5,'Healthy (1).png',29,{_hex(png_as_jpg)},'image/png')",
    ]
    lines.insert(4, "INSERT INTO `sample_image` VALUES " + ",".join(image_rows) + ";")  # noqa: S608
    path.write_bytes(("\r\n".join(lines) + "\r\n").encode())


@pytest.fixture
def workspace(tmp_path: Path) -> dict[str, Path]:
    photos = tmp_path / "plants"
    photos.mkdir()
    for name, color in (("tomato.jpg", (200, 30, 30)), ("blueberry.jpg", (30, 30, 200))):
        (photos / name).write_bytes(_image_bytes("JPEG", color, (2000, 1000)))
    (photos / "raspberry.jpg").write_bytes(_image_bytes("JPEG", (250, 0, 120)))
    dump = tmp_path / "dump.sql"
    _write_dump(dump, _image_bytes("PNG", (10, 150, 40)), _image_bytes("JPEG", (40, 120, 20)))
    out = tmp_path / "seeds"
    (out / "images").mkdir(parents=True)
    (out / "images" / ".gitkeep").write_text("")
    (out / "images" / "stale.jpg").write_bytes(b"old")
    return {"dump": dump, "photos": photos, "out": out, "root": tmp_path}


def test_full_run_writes_catalog_images_and_contract(workspace: dict[str, Path]) -> None:
    catalog, media = run_extraction(
        workspace["dump"], workspace["photos"], workspace["out"], _config()
    )
    out = workspace["out"]
    assert [p["slug"] for p in catalog.plants] == ["blueberry", "tomato"]
    assert [d["slug"] for d in catalog.diseases] == ["early-blight"]

    images = json.loads((out / "data" / "images.json").read_text(encoding="utf-8"))
    assert len(images) == 2  # png named jpg + jpeg; the repeated jpeg is deduped
    assert len(media.duplicates) == 1
    assert len(media.rejected) == 1
    assert media.rejected[0].corruption > 0.5
    for record in images:
        data = (out / record["key"]).read_bytes()
        assert sniff_image_type(data) == "jpeg"
        assert record["key"].startswith("images/tomato/early-blight/")
    assert not (out / "images" / "stale.jpg").exists()
    assert (out / "images" / ".gitkeep").exists()

    verdicts = json.loads((out / "data" / "verdict_samples.json").read_text(encoding="utf-8"))
    assert [v["verdict"] for v in verdicts] == ["healthy"]
    assert verdicts[0]["key"].startswith("verdict_samples/healthy/")

    labels = json.loads((out / "labels.json").read_text(encoding="utf-8"))
    assert labels["plants"] == {"blueberry": [], "tomato": ["early-blight"]}

    plants = json.loads((out / "data" / "plants.json").read_text(encoding="utf-8"))
    tomato = next(p for p in plants if p["slug"] == "tomato")
    assert tomato["photo"] == "plant_photos/tomato.jpg"
    with Image.open(out / tomato["photo"]) as photo:
        assert photo.size == (1280, 640)
    assert not (out / "plant_photos" / "raspberry.jpg").exists()

    report = (out / "cleaning_report.md").read_text(encoding="utf-8")
    assert "1 of 5 image rows" in report


def test_extra_images_directory_supplements_the_dump(workspace: dict[str, Path]) -> None:
    extra = workspace["root"] / "extra"
    (extra / "tomato" / "early-blight").mkdir(parents=True)
    (extra / "tomato" / "early-blight" / "a.png").write_bytes(_image_bytes("PNG", (1, 2, 3)))
    (extra / "_unknown").mkdir()
    (extra / "_unknown" / "u.webp").write_bytes(_image_bytes("WEBP", (9, 9, 9)))
    _, media = run_extraction(
        workspace["dump"], workspace["photos"], workspace["out"], _config(), extra
    )
    assert len(media.images) == 3
    assert [v["verdict"] for v in media.verdict_samples] == ["healthy", "unknown"]


def test_extra_images_for_unknown_disease_is_a_hard_failure(workspace: dict[str, Path]) -> None:
    extra = workspace["root"] / "extra"
    (extra / "tomato" / "made-up").mkdir(parents=True)
    (extra / "tomato" / "made-up" / "a.png").write_bytes(_image_bytes("PNG", (1, 2, 3)))
    with pytest.raises(CatalogError, match="made-up"):
        run_extraction(workspace["dump"], workspace["photos"], workspace["out"], _config(), extra)


def test_unlisted_plant_photo_is_a_hard_failure(workspace: dict[str, Path]) -> None:
    (workspace["photos"] / "mystery.jpg").write_bytes(_image_bytes("JPEG", (1, 1, 1)))
    with pytest.raises(CatalogError, match=r"mystery\.jpg"):
        run_extraction(workspace["dump"], workspace["photos"], workspace["out"], _config())


def test_missing_plant_photo_is_a_hard_failure(workspace: dict[str, Path]) -> None:
    (workspace["photos"] / "blueberry.jpg").unlink()
    with pytest.raises(CatalogError, match="blueberry"):
        run_extraction(workspace["dump"], workspace["photos"], workspace["out"], _config())


def _snapshot(root: Path) -> dict[str, bytes]:
    return {
        str(p.relative_to(root)): p.read_bytes() for p in sorted(root.rglob("*")) if p.is_file()
    }


def test_empty_dump_fails_and_leaves_outputs_untouched(workspace: dict[str, Path]) -> None:
    good = workspace["out"] / "images" / "x"
    good.mkdir()
    (good / "good.jpg").write_bytes(b"keep me")
    workspace["dump"].write_bytes(b"")
    before = _snapshot(workspace["out"])
    with pytest.raises(CatalogError, match="plant"):
        run_extraction(workspace["dump"], workspace["photos"], workspace["out"], _config())
    assert _snapshot(workspace["out"]) == before


def test_failure_after_staging_leaves_outputs_untouched(workspace: dict[str, Path]) -> None:
    (workspace["photos"] / "mystery.jpg").write_bytes(_image_bytes("JPEG", (1, 1, 1)))
    before = _snapshot(workspace["out"])
    with pytest.raises(CatalogError):
        run_extraction(workspace["dump"], workspace["photos"], workspace["out"], _config())
    assert _snapshot(workspace["out"]) == before
    assert sorted(p.name for p in workspace["root"].iterdir() if p.is_dir()) == [
        "plants",
        "seeds",
    ]


def test_unexpected_counts_are_a_hard_failure(workspace: dict[str, Path]) -> None:
    with pytest.raises(CatalogError, match="expected 13 plants"):
        run_extraction(
            workspace["dump"],
            workspace["photos"],
            workspace["out"],
            _config(),
            expected=ExpectedCounts(plants=13, diseases=27),
        )


def test_insert_ignore_and_replace_forms_are_parsed(workspace: dict[str, Path]) -> None:
    text = workspace["dump"].read_text(encoding="utf-8")
    text = text.replace("INSERT INTO `plant`", "INSERT IGNORE INTO `plant`")
    text = text.replace("INSERT INTO `disease`", "REPLACE INTO `disease`")
    workspace["dump"].write_text(text, encoding="utf-8", newline="")
    catalog, _ = run_extraction(workspace["dump"], workspace["photos"], workspace["out"], _config())
    assert len(catalog.plants) == 2


def test_complete_insert_column_lists_are_rejected_loudly(workspace: dict[str, Path]) -> None:
    text = workspace["dump"].read_text(encoding="utf-8")
    text = text.replace("INSERT INTO `plant` VALUES", "INSERT INTO `plant` (`id`,`name`) VALUES")
    workspace["dump"].write_text(text, encoding="utf-8", newline="")
    with pytest.raises(DumpParseError, match="column list"):
        run_extraction(workspace["dump"], workspace["photos"], workspace["out"], _config())


def test_report_flags_zero_images_as_an_open_item(workspace: dict[str, Path]) -> None:
    text = workspace["dump"].read_text(encoding="utf-8")
    lines = [ln for ln in text.splitlines() if "INTO `sample_image`" not in ln]
    workspace["dump"].write_text("\r\n".join(lines) + "\r\n", encoding="utf-8", newline="")
    run_extraction(workspace["dump"], workspace["photos"], workspace["out"], _config())
    report = (workspace["out"] / "cleaning_report.md").read_text(encoding="utf-8")
    assert "## Open items" in report
    assert "--hex-blob" in report
