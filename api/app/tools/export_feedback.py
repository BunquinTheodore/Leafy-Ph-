"""Export result feedback as CSV so the ML team can see where the model is wrong.

Usage (from api/): python -m app.tools.export_feedback [--output feedback.csv]

The export holds scan ids, predicted and corrected labels and the image key. It carries no user
identity. Scan images are not part of it and are not used for training unless the team decides
that and updates the Privacy Policy.
"""

import argparse
import asyncio
import csv
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import TextIO

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import get_settings
from app.db.session import create_engine, create_session_factory
from app.db.uow import UnitOfWork

COLUMNS = (
    "scan_id",
    "created_at",
    "verdict",
    "predicted_plant",
    "predicted_disease",
    "confidence",
    "is_correct",
    "correct_plant",
    "correct_disease",
    "comment",
    "image_key",
)
_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def _safe_cell(value: str | None) -> str:
    """Neutralize spreadsheet formulas in user typed text."""
    text = value or ""
    return f"'{text}" if text.startswith(_FORMULA_PREFIXES) else text


async def export_feedback(session_factory: async_sessionmaker[AsyncSession], out: TextIO) -> int:
    """Write one CSV row per feedback entry and return the number of rows."""
    async with UnitOfWork(session_factory) as uow:
        rows = await uow.scans.feedback_export_rows()
    writer = csv.writer(out, lineterminator="\n")
    writer.writerow(COLUMNS)
    for row in rows:
        writer.writerow(
            [
                str(row.scan_id),
                row.created_at.isoformat(),
                row.verdict or "",
                row.predicted_plant or "",
                row.predicted_disease or "",
                row.confidence or "",
                "true" if row.is_correct else "false",
                row.correct_plant or "",
                row.correct_disease or "",
                _safe_cell(row.comment),
                row.image_key,
            ]
        )
    return len(rows)


async def _main(output: Path | None) -> int:
    settings = get_settings()
    engine = create_engine(settings.database_url, null_pool=True)
    try:
        factory = create_session_factory(engine)
        if output is None:
            return await export_feedback(factory, sys.stdout)
        with output.open("w", encoding="utf-8", newline="") as handle:
            return await export_feedback(factory, handle)
    finally:
        await engine.dispose()


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.tools.export_feedback")
    parser.add_argument("--output", type=Path, help="write to this file instead of stdout")
    args = parser.parse_args(argv)
    count = asyncio.run(_main(args.output))
    sys.stderr.write(f"Exported {count} feedback rows\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
