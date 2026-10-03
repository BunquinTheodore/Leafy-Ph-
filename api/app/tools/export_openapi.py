"""Write the OpenAPI document to api/openapi.json (no database connection is made).

Usage: python -m app.tools.export_openapi [output_path]
"""

import json
import sys
from pathlib import Path

from app.core.config import Settings
from app.main import create_app

DEFAULT_OUTPUT = Path(__file__).resolve().parents[2] / "openapi.json"
_EXPORT_SECRET = "openapi-export-only-secret-not-used-at-runtime"  # noqa: S105


def build_openapi() -> dict[str, object]:
    settings = Settings(
        _env_file=None,
        env="test",
        database_url="postgresql+asyncpg://export:export@localhost:5432/export",
        jwt_secret=_EXPORT_SECRET,
    )
    return create_app(settings).openapi()


def main(argv: list[str]) -> int:
    output = Path(argv[1]) if len(argv) > 1 else DEFAULT_OUTPUT
    document = json.dumps(build_openapi(), indent=2, sort_keys=True, ensure_ascii=False)
    output.write_text(document + "\n", encoding="utf-8")
    sys.stdout.write(f"Wrote {output}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
