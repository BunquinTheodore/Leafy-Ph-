"""Application settings. Missing or unsafe values stop startup (fail fast)."""

from functools import lru_cache
from typing import Literal, Self

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

PLACEHOLDER_SECRET_PREFIX = "replace-with"  # noqa: S105 - marks the .env.example value
MIN_JWT_SECRET_LENGTH = 32
MOCK_ALLOWED_ENVS = frozenset({"dev", "test"})


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    env: Literal["dev", "test", "prod"] = "dev"
    log_level: str = "INFO"

    database_url: str
    jwt_secret: SecretStr
    jwt_issuer: str = "leafy-api"
    jwt_audience: str = "leafy-web"

    access_token_ttl_seconds: int = Field(default=900, ge=60, le=3600)
    refresh_token_ttl_days: int = Field(default=30, ge=1, le=90)
    refresh_family_max_days: int = Field(default=90, ge=1, le=365)
    refresh_grace_seconds: int = Field(default=10, ge=0, le=60)

    argon2_time_cost: int = Field(default=2, ge=1)
    argon2_memory_kib: int = Field(default=19456, ge=8)
    argon2_parallelism: int = Field(default=1, ge=1)

    ml_service: str = "stub"
    max_upload_bytes: int = Field(default=8_388_608, ge=1)
    scan_quota: int = Field(default=500, ge=1)
    ml_timeout: float = Field(default=30.0, ge=0.1, le=600.0)
    scan_workers: int = Field(default=2, ge=1, le=16)
    scan_stuck_seconds: int = Field(default=300, ge=30, le=86400)
    scan_janitor_interval_seconds: int = Field(default=60, ge=5, le=3600)

    rate_limit_enabled: bool = True
    trusted_proxy_hops: int = Field(default=0, ge=0, le=5)

    fresh_session_seconds: int = Field(default=600, ge=60, le=600)

    s3_endpoint_url: str | None = None
    s3_public_endpoint: str = "http://localhost:9000"
    s3_region: str = "us-east-1"
    s3_access_key: SecretStr | None = None
    s3_secret_key: SecretStr | None = None
    s3_scans_bucket: str = "leafy-scans"
    s3_catalog_bucket: str = "leafy-catalog"
    s3_presign_ttl_seconds: int = Field(default=600, ge=30, le=3600)

    # Firebase project that issues the Google sign in ID tokens. Empty disables Google sign in.
    firebase_project_id: str = ""
    google_mock: bool = False
    # The mock signing key is public, so the mock must be opted into explicitly, on top of
    # GOOGLE_MOCK, and only ever in dev or test. Never set this on a reachable deployment.
    allow_insecure_mocks: bool = False

    @field_validator("firebase_project_id")
    @classmethod
    def _strip_firebase_project_id(cls, value: str) -> str:
        return value.strip()

    @field_validator("database_url")
    @classmethod
    def _require_asyncpg(cls, value: str) -> str:
        if not value.startswith("postgresql+asyncpg://"):
            raise ValueError("DATABASE_URL must start with postgresql+asyncpg://")
        return value

    @field_validator("jwt_secret")
    @classmethod
    def _require_strong_secret(cls, value: SecretStr) -> SecretStr:
        secret = value.get_secret_value()
        if len(secret) < MIN_JWT_SECRET_LENGTH:
            raise ValueError("JWT_SECRET must be at least 32 characters")
        if secret.startswith(PLACEHOLDER_SECRET_PREFIX):
            raise ValueError("JWT_SECRET still has the placeholder value")
        return value

    @model_validator(mode="after")
    def _forbid_mock_google_in_prod(self) -> Self:
        if not self.google_mock:
            return self
        if self.env not in MOCK_ALLOWED_ENVS:
            raise ValueError("GOOGLE_MOCK is only allowed when ENV is dev or test")
        if not self.allow_insecure_mocks:
            raise ValueError("GOOGLE_MOCK=1 also needs ALLOW_INSECURE_MOCKS=1 (public signing key)")
        return self

    @model_validator(mode="after")
    def _forbid_dev_fake_ml_in_prod(self) -> Self:
        if self.ml_service.strip() == "dev-fake" and self.env == "prod":
            raise ValueError("ML_SERVICE=dev-fake must not be used in prod")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
