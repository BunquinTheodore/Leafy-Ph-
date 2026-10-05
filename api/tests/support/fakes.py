"""In memory stand in for object storage, used by tests only."""

from collections.abc import Sequence

from app.services.infra.storage_service import StorageError


class FakeStorage:
    """Dict backed storage. `down = True` makes every delete fail like an S3 outage."""

    def __init__(self) -> None:
        self.objects: dict[tuple[str, str], bytes] = {}
        self.down = False
        self.fail_puts = False
        self.fail_gets = False
        self.delete_calls = 0

    async def put_object(self, bucket: str, key: str, data: bytes, content_type: str) -> None:
        if self.fail_puts:
            raise StorageError("simulated outage")
        self.objects[(bucket, key)] = data

    async def get_object(self, bucket: str, key: str) -> bytes:
        if self.fail_gets:
            raise StorageError("simulated outage")
        try:
            return self.objects[(bucket, key)]
        except KeyError as exc:
            raise StorageError("missing") from exc

    async def object_exists(self, bucket: str, key: str) -> bool:
        return (bucket, key) in self.objects

    async def delete_objects(self, bucket: str, keys: Sequence[str]) -> list[str]:
        self.delete_calls += 1
        if self.down:
            raise StorageError("simulated outage")
        for key in keys:
            self.objects.pop((bucket, key), None)
        return []

    async def presign_get(self, bucket: str, key: str, expires_seconds: int | None = None) -> str:
        return f"http://storage.test/{bucket}/{key}?expires={expires_seconds}"

    def public_catalog_url(self, key: str) -> str:
        return f"http://storage.test/leafy-catalog/{key}"
