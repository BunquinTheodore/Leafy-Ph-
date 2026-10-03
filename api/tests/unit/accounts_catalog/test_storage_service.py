"""S3StorageService against moto (no network, no credentials)."""

from collections.abc import Iterator

import boto3
import pytest
from app.services.infra import storage_service
from app.services.infra.storage_service import S3StorageService, StorageError
from moto import mock_aws

from tests.conftest import make_settings

SCANS = "leafy-scans"
CATALOG = "leafy-catalog"


@pytest.fixture
def storage() -> Iterator[S3StorageService]:
    with mock_aws():
        client = boto3.client("s3", region_name="us-east-1")
        client.create_bucket(Bucket=SCANS)
        client.create_bucket(Bucket=CATALOG)
        settings = make_settings(
            s3_access_key="testing",
            s3_secret_key="testing",
            s3_public_endpoint="http://localhost:9000",
        )
        yield S3StorageService(settings)


async def test_put_get_and_exists_round_trip(storage: S3StorageService) -> None:
    await storage.put_object(SCANS, "u/1.jpg", b"jpeg-bytes", "image/jpeg")
    assert await storage.object_exists(SCANS, "u/1.jpg") is True
    assert await storage.get_object(SCANS, "u/1.jpg") == b"jpeg-bytes"


async def test_missing_key_does_not_exist_and_cannot_be_read(storage: S3StorageService) -> None:
    assert await storage.object_exists(SCANS, "nope.jpg") is False
    with pytest.raises(StorageError):
        await storage.get_object(SCANS, "nope.jpg")


async def test_delete_objects_removes_keys_and_treats_missing_keys_as_deleted(
    storage: S3StorageService,
) -> None:
    await storage.put_object(SCANS, "a.jpg", b"a", "image/jpeg")
    await storage.put_object(SCANS, "b.jpg", b"b", "image/jpeg")
    failed = await storage.delete_objects(SCANS, ["a.jpg", "b.jpg", "never-existed.jpg"])
    assert failed == []
    assert await storage.object_exists(SCANS, "a.jpg") is False
    assert await storage.object_exists(SCANS, "b.jpg") is False


async def test_delete_objects_works_in_chunks(
    storage: S3StorageService, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(storage_service, "DELETE_BATCH_LIMIT", 2)
    keys = [f"k{i}.jpg" for i in range(5)]
    for key in keys:
        await storage.put_object(SCANS, key, b"x", "image/jpeg")
    assert await storage.delete_objects(SCANS, keys) == []
    for key in keys:
        assert await storage.object_exists(SCANS, key) is False


async def test_delete_objects_reports_every_key_as_failed_when_the_bucket_is_gone(
    storage: S3StorageService,
) -> None:
    failed = await storage.delete_objects("no-such-bucket", ["a.jpg", "b.jpg"])
    assert sorted(failed) == ["a.jpg", "b.jpg"]


async def test_delete_nothing_is_a_no_op(storage: S3StorageService) -> None:
    assert await storage.delete_objects(SCANS, []) == []


async def test_presigned_url_is_signed_for_the_public_endpoint(storage: S3StorageService) -> None:
    url = await storage.presign_get(SCANS, "u/1.jpg")
    assert url.startswith("http://localhost:9000/leafy-scans/u/1.jpg?")
    assert "X-Amz-Signature=" in url
    assert "X-Amz-Expires=600" in url
    short = await storage.presign_get(SCANS, "u/1.jpg", expires_seconds=60)
    assert "X-Amz-Expires=60" in short


def test_public_catalog_url_uses_the_public_endpoint_and_catalog_bucket(
    storage: S3StorageService,
) -> None:
    assert (
        storage.public_catalog_url("plant_photos/tomato.jpg")
        == "http://localhost:9000/leafy-catalog/plant_photos/tomato.jpg"
    )
    assert storage.public_catalog_url("/x.jpg") == "http://localhost:9000/leafy-catalog/x.jpg"
