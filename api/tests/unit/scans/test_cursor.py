import uuid
from datetime import UTC, datetime

import pytest
from app.core.errors import AppError, ErrorCode
from app.repositories.scan_repository import decode_cursor, encode_cursor


def test_round_trip() -> None:
    created = datetime(2026, 3, 4, 5, 6, 7, 123456, tzinfo=UTC)
    scan_id = uuid.uuid4()
    assert decode_cursor(encode_cursor(created, scan_id)) == (created, scan_id)


@pytest.mark.parametrize("bad", ["", "not-base64!!", "e30", "eyJ0IjoiMSJ9", "YWJj"])
def test_bad_cursors_are_rejected(bad: str) -> None:
    with pytest.raises(AppError) as caught:
        decode_cursor(bad)
    assert caught.value.code is ErrorCode.INVALID_CURSOR
