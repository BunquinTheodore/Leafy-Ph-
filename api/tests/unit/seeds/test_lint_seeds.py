from __future__ import annotations

import json
from pathlib import Path

from tools.lint_seeds import lint_seed_data


def _write(directory: Path, name: str, document: object) -> None:
    (directory / name).write_text(json.dumps(document), encoding="utf-8")


def test_clean_data_has_no_findings(tmp_path: Path) -> None:
    _write(tmp_path, "entries.json", [{"text": "Remove infected leaves"}])
    assert lint_seed_data(tmp_path) == []


def test_soft_hyphen_is_flagged_with_its_location(tmp_path: Path) -> None:
    _write(tmp_path, "diseases.json", [{"name": "Early\u00adBlight"}])
    findings = lint_seed_data(tmp_path)
    assert len(findings) == 1
    assert "diseases.json[0].name" in findings[0]
    assert "soft hyphen" in findings[0]


def test_html_soft_hyphen_entity_is_flagged(tmp_path: Path) -> None:
    _write(tmp_path, "diseases.json", [{"name": "Early&shy;Blight"}])
    assert lint_seed_data(tmp_path)


def test_line_break_hyphen_is_flagged(tmp_path: Path) -> None:
    _write(tmp_path, "entries.json", [{"text": "spreads by infec-\ntion of leaves"}])
    findings = lint_seed_data(tmp_path)
    assert any("line break hyphen" in f for f in findings)


def test_hyphen_then_space_artifact_is_flagged_but_suspended_hyphen_is_not(tmp_path: Path) -> None:
    _write(tmp_path, "entries.json", [{"text": "spreads by infec- tion"}])
    assert lint_seed_data(tmp_path)
    _write(tmp_path, "entries.json", [{"text": "repeat at 5- to 7-day intervals"}])
    assert lint_seed_data(tmp_path) == []


def test_nested_values_are_checked(tmp_path: Path) -> None:
    _write(tmp_path, "images.json", [{"alt": ["ok", {"deep": "bad\u00adtext"}]}])
    assert lint_seed_data(tmp_path)


def test_missing_files_are_skipped(tmp_path: Path) -> None:
    assert lint_seed_data(tmp_path) == []
