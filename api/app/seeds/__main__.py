"""Seed command.

python -m app.seeds                 load the catalog (idempotent) and upload missing images
python -m app.seeds --skip-images   load rows only, no storage access
python -m app.seeds --check         assert 13 plants, 27 diseases and the labels.json match
"""

import argparse
import asyncio
import sys
from collections.abc import Sequence
from pathlib import Path

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db.session import create_engine, create_session_factory
from app.seeds.loader import SEEDS_DIR, SeedError, check_database, load_bundle, seed_database
from app.services.infra.storage_service import S3StorageService, StorageError


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m app.seeds", description=__doc__)
    parser.add_argument("--check", action="store_true", help="verify the loaded catalog and exit")
    parser.add_argument(
        "--skip-images", action="store_true", help="do not upload catalog images to storage"
    )
    parser.add_argument("--data-dir", type=Path, default=SEEDS_DIR, help="seed directory")
    return parser


def _write(line: str, *, error: bool = False) -> None:
    (sys.stderr if error else sys.stdout).write(line + "\n")


async def run(args: argparse.Namespace) -> int:
    settings = get_settings()
    configure_logging(settings.log_level)
    engine = create_engine(settings.database_url, null_pool=True)
    factory = create_session_factory(engine)
    try:
        if args.check:
            result = await check_database(factory, args.data_dir)
            for problem in result.problems:
                _write(f"check failed: {problem}", error=True)
            _write("seed check passed" if result.ok else "seed check failed")
            return 0 if result.ok else 1
        storage = None if args.skip_images else S3StorageService(settings)
        report = await seed_database(
            factory,
            load_bundle(args.data_dir),
            storage=storage,
            catalog_bucket=settings.s3_catalog_bucket,
        )
        _write(
            f"seeded {report.plants} plants, {report.diseases} diseases, "
            f"{report.entries} entries, {report.affected_species} affected species, "
            f"{report.images} images (uploaded {report.uploaded}, "
            f"already present {report.already_present})"
        )
        return 0
    except (SeedError, StorageError) as exc:
        _write(f"seed failed: {exc}", error=True)
        return 1
    finally:
        await engine.dispose()


def main(argv: Sequence[str] | None = None) -> int:
    return asyncio.run(run(build_parser().parse_args(argv)))


if __name__ == "__main__":
    raise SystemExit(main())
