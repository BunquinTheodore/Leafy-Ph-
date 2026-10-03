"""Shared test helpers. Settings never read a real .env or real credentials."""

from typing import Any

import pytest
from app.core.config import Settings

TEST_JWT_SECRET = "test-secret-for-unit-tests-0123456789abcdef"
TEST_DATABASE_URL = "postgresql+asyncpg://test:test@127.0.0.1:1/never_connects"


def make_settings(**overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "env": "test",
        "database_url": TEST_DATABASE_URL,
        "jwt_secret": TEST_JWT_SECRET,
        "argon2_time_cost": 1,
        "argon2_memory_kib": 64,
        "argon2_parallelism": 1,
        "log_level": "WARNING",
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


@pytest.fixture
def settings() -> Settings:
    return make_settings()
