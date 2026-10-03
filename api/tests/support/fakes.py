"""In memory stand ins for email and object storage, used by tests only."""

import re
from collections.abc import Sequence

from app.services.infra.email_service import EmailDeliveryError, OutgoingEmail
from app.services.infra.storage_service import StorageError

_TOKEN_IN_LINK = re.compile(r"token=([^\s&\"<]+)")


class FakeEmailSender:
    """Records messages. Set `fail = True` to simulate an SMTP outage."""

    def __init__(self) -> None:
        self.sent: list[OutgoingEmail] = []
        self.fail = False

    async def send(self, message: OutgoingEmail) -> None:
        if self.fail:
            raise EmailDeliveryError("simulated outage")
        self.sent.append(message)

    def to(self, address: str) -> list[OutgoingEmail]:
        return [m for m in self.sent if m.to == address]

    def last_token(self, address: str) -> str:
        """The token inside the link of the newest message sent to `address`."""
        match = _TOKEN_IN_LINK.search(self.to(address)[-1].text)
        assert match is not None, "no token link in the email"
        return match.group(1)


class FakeStorage:
    """Dict backed storage. `down = True` makes every delete fail like an S3 outage."""

    def __init__(self) -> None:
        self.objects: dict[tuple[str, str], bytes] = {}
        self.down = False
        self.delete_calls = 0

    async def put_object(self, bucket: str, key: str, data: bytes, content_type: str) -> None:
        self.objects[(bucket, key)] = data

    async def get_object(self, bucket: str, key: str) -> bytes:
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
