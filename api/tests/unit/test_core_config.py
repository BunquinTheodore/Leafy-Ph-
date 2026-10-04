import pytest
from app.core.config import Settings, get_settings
from pydantic import ValidationError

from tests.conftest import TEST_DATABASE_URL, TEST_JWT_SECRET, make_settings


def test_valid_settings_load_with_defaults() -> None:
    settings = make_settings()
    assert settings.access_token_ttl_seconds == 900
    assert settings.refresh_grace_seconds == 10
    assert settings.jwt_secret.get_secret_value() == TEST_JWT_SECRET


def test_secret_is_not_exposed_in_repr() -> None:
    assert TEST_JWT_SECRET not in repr(make_settings())


def test_missing_required_values_fail_fast() -> None:
    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_short_jwt_secret_is_rejected() -> None:
    with pytest.raises(ValidationError):
        make_settings(jwt_secret="too-short")


def test_placeholder_jwt_secret_is_rejected() -> None:
    with pytest.raises(ValidationError):
        make_settings(jwt_secret="replace-with-a-long-random-string-at-least-32-chars")


def test_non_asyncpg_database_url_is_rejected() -> None:
    with pytest.raises(ValidationError):
        make_settings(database_url="postgresql://user:pw@localhost/db")


def test_environment_variables_are_read(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", TEST_DATABASE_URL)
    monkeypatch.setenv("JWT_SECRET", TEST_JWT_SECRET)
    monkeypatch.setenv("REFRESH_GRACE_SECONDS", "5")
    get_settings.cache_clear()
    try:
        assert get_settings().refresh_grace_seconds == 5
    finally:
        get_settings.cache_clear()
