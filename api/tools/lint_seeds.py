"""Lint committed seed JSON for hyphenation artifacts and lost characters.

Run with ``python -m tools.lint_seeds`` (exit code 1 when anything is flagged).
Flags soft hyphens, ``&shy;``, hyphens left at line breaks and U+FFFD in every
string field of the seed data files.
"""

from __future__ import annotations

import json
import sys
from collections.abc import Iterator
from pathlib import Path
from typing import Any

from tools.seed_text import find_text_problems

SEEDS_DIR = Path(__file__).resolve().parents[1] / "app" / "seeds"
DATA_FILES = (
    "plants.json",
    "diseases.json",
    "entries.json",
    "affected_species.json",
    "images.json",
    "verdict_samples.json",
)


def _strings(node: Any, path: str) -> Iterator[tuple[str, str]]:
    if isinstance(node, str):
        yield path, node
    elif isinstance(node, dict):
        for key, value in node.items():
            yield from _strings(value, f"{path}.{key}")
    elif isinstance(node, list):
        for index, value in enumerate(node):
            yield from _strings(value, f"{path}[{index}]")


def lint_seed_data(data_dir: Path) -> list[str]:
    """Return one message per flagged string across all seed data files."""
    findings: list[str] = []
    for filename in DATA_FILES:
        file = data_dir / filename
        if not file.exists():
            continue
        document = json.loads(file.read_text(encoding="utf-8"))
        for path, text in _strings(document, filename):
            findings.extend(
                f"{path}: {problem}: {text[:60]!r}" for problem in find_text_problems(text)
            )
    return findings


def main() -> int:
    findings = lint_seed_data(SEEDS_DIR / "data")
    for finding in findings:
        sys.stderr.write(f"{finding}\n")
    sys.stdout.write(f"seed lint: {len(findings)} problem(s)\n")
    return 1 if findings else 0


if __name__ == "__main__":
    raise SystemExit(main())
