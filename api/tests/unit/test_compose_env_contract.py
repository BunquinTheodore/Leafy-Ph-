"""The compose api environment must only use names the API Settings actually reads."""

from pathlib import Path
from typing import Any, cast

import yaml  # type: ignore[import-untyped]
from app.core.config import Settings

REPO_ROOT = Path(__file__).resolve().parents[3]
EXTRA_ALLOWED = {"ENV"}


def _compose() -> dict[str, Any]:
    text = (REPO_ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    return cast("dict[str, Any]", yaml.safe_load(text))


def test_every_api_env_key_is_a_settings_field() -> None:
    keys = {key.lower() for key in _compose()["x-api-env"]}
    unknown = keys - set(Settings.model_fields)
    assert not unknown, f"compose passes names the API ignores: {sorted(unknown)}"


def test_api_environment_selects_the_runtime_env_and_defaults_to_prod() -> None:
    compose = _compose()
    assert compose["x-api-env"]["ENV"].startswith("${ENV:-prod}")
    assert {"ENV"} <= set(compose["x-api-env"]) | EXTRA_ALLOWED


def test_dev_override_selects_dev_env_for_api_and_purge() -> None:
    override = yaml.safe_load(
        (REPO_ROOT / "docker-compose.override.yml").read_text(encoding="utf-8")
    )
    for service in ("api", "purge"):
        assert override["services"][service]["environment"]["ENV"] == "dev"


def test_root_env_example_has_no_mock_google_and_uses_real_names() -> None:
    lines = (REPO_ROOT / ".env.example").read_text(encoding="utf-8").splitlines()
    assigned = {line.split("=", 1)[0] for line in lines if "=" in line and not line.startswith("#")}
    assert "GOOGLE_MOCK=0" in lines
    for stale in ("S3_ENDPOINT", "S3_BUCKET_SCANS", "S3_BUCKET_CATALOG", "SMTP_USER"):
        assert stale not in assigned
