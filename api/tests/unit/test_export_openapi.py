import json
from pathlib import Path

from app.tools.export_openapi import build_openapi, main


def test_build_openapi_lists_core_routes() -> None:
    document = build_openapi()
    paths = document["paths"]
    assert isinstance(paths, dict)
    for route in (
        "/api/v1/auth/register",
        "/api/v1/auth/login",
        "/api/v1/auth/refresh",
        "/api/v1/auth/logout",
        "/api/v1/users/me",
        "/api/v1/healthz",
        "/api/v1/readyz",
    ):
        assert route in paths


def test_main_writes_the_file(tmp_path: Path) -> None:
    target = tmp_path / "openapi.json"
    assert main(["export", str(target)]) == 0
    assert json.loads(target.read_text(encoding="utf-8"))["info"]["title"] == "Leafy API"
