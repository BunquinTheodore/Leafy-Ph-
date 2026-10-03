"""Object storage behind a Protocol. The S3 implementation runs boto3 in a threadpool.

Two clients are used on purpose: the internal one talks to `S3_ENDPOINT_URL` (for example the
MinIO container) and the presign client signs URLs against `S3_PUBLIC_ENDPOINT`, the host the
browser can reach. A URL signed for one host is rejected by the other.
"""

import asyncio
from collections.abc import Callable, Sequence
from typing import Any, Protocol

import boto3
from botocore.client import BaseClient
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from app.core.config import Settings

DELETE_BATCH_LIMIT = 1000
_NOT_FOUND_CODES = frozenset({"404", "NoSuchKey", "NotFound"})


class StorageError(Exception):
    """The storage backend failed. The message never carries keys or credentials."""


class StorageService(Protocol):
    async def put_object(self, bucket: str, key: str, data: bytes, content_type: str) -> None: ...

    async def get_object(self, bucket: str, key: str) -> bytes: ...

    async def object_exists(self, bucket: str, key: str) -> bool: ...

    async def delete_objects(self, bucket: str, keys: Sequence[str]) -> list[str]:
        """Delete keys and return the ones that failed. Missing keys count as deleted."""
        ...

    async def presign_get(
        self, bucket: str, key: str, expires_seconds: int | None = None
    ) -> str: ...

    def public_catalog_url(self, key: str) -> str: ...


def _client_error_code(exc: ClientError) -> str:
    return str(exc.response.get("Error", {}).get("Code", ""))


class S3StorageService:
    """boto3 backed storage. Clients are created on first use so startup needs no network."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._internal: BaseClient | None = None
        self._presigner: BaseClient | None = None

    def _build(self, endpoint_url: str | None) -> BaseClient:
        settings = self._settings
        access = settings.s3_access_key.get_secret_value() if settings.s3_access_key else None
        secret = settings.s3_secret_key.get_secret_value() if settings.s3_secret_key else None
        return boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            region_name=settings.s3_region,
            aws_access_key_id=access,
            aws_secret_access_key=secret,
            config=Config(
                signature_version="s3v4",
                s3={"addressing_style": "path"},
                retries={"max_attempts": 2, "mode": "standard"},
                connect_timeout=5,
                read_timeout=15,
            ),
        )

    @property
    def _client(self) -> BaseClient:
        if self._internal is None:
            self._internal = self._build(self._settings.s3_endpoint_url)
        return self._internal

    @property
    def _presign_client(self) -> BaseClient:
        if self._presigner is None:
            self._presigner = self._build(self._settings.s3_public_endpoint)
        return self._presigner

    async def _run[T](self, call: Callable[[], T]) -> T:
        try:
            return await asyncio.to_thread(call)
        except (ClientError, BotoCoreError) as exc:
            raise StorageError("storage request failed") from exc

    async def put_object(self, bucket: str, key: str, data: bytes, content_type: str) -> None:
        await self._run(
            lambda: self._client.put_object(
                Bucket=bucket, Key=key, Body=data, ContentType=content_type
            )
        )

    async def get_object(self, bucket: str, key: str) -> bytes:
        def read() -> bytes:
            body = self._client.get_object(Bucket=bucket, Key=key)["Body"]
            try:
                payload: bytes = body.read()
            finally:
                body.close()
            return payload

        return await self._run(read)

    async def object_exists(self, bucket: str, key: str) -> bool:
        def check() -> bool:
            try:
                self._client.head_object(Bucket=bucket, Key=key)
            except ClientError as exc:
                if _client_error_code(exc) in _NOT_FOUND_CODES:
                    return False
                raise
            return True

        return await self._run(check)

    async def delete_objects(self, bucket: str, keys: Sequence[str]) -> list[str]:
        failed: list[str] = []
        for start in range(0, len(keys), DELETE_BATCH_LIMIT):
            chunk = list(keys[start : start + DELETE_BATCH_LIMIT])
            failed.extend(await self._delete_chunk(bucket, chunk))
        return failed

    async def _delete_chunk(self, bucket: str, chunk: list[str]) -> list[str]:
        def delete() -> dict[str, Any]:
            response: dict[str, Any] = self._client.delete_objects(
                Bucket=bucket,
                Delete={"Objects": [{"Key": key} for key in chunk], "Quiet": True},
            )
            return response

        try:
            result = await self._run(delete)
        except StorageError:
            return chunk
        return [item["Key"] for item in result.get("Errors", []) if "Key" in item]

    async def presign_get(self, bucket: str, key: str, expires_seconds: int | None = None) -> str:
        ttl = expires_seconds or self._settings.s3_presign_ttl_seconds
        return await self._run(
            lambda: self._presign_client.generate_presigned_url(
                "get_object", Params={"Bucket": bucket, "Key": key}, ExpiresIn=ttl
            )
        )

    def public_catalog_url(self, key: str) -> str:
        base = self._settings.s3_public_endpoint.rstrip("/")
        return f"{base}/{self._settings.s3_catalog_bucket}/{key.lstrip('/')}"
