import io

import pytest
from app.core.errors import AppError, ErrorCode
from app.services.image_validator import MAX_LONG_EDGE, MAX_PIXELS, sanitize_image
from PIL import Image

from tests.support.images import jpeg_with_gps, make_image

LIMIT = 8 * 1024 * 1024


def _code(raw: bytes, max_bytes: int = LIMIT) -> ErrorCode:
    with pytest.raises(AppError) as caught:
        sanitize_image(raw, max_bytes=max_bytes)
    return caught.value.code


@pytest.mark.parametrize("fmt", ["JPEG", "PNG", "WEBP"])
def test_accepts_supported_formats_and_returns_jpeg(fmt: str) -> None:
    result = sanitize_image(make_image(fmt), max_bytes=LIMIT)
    assert result.data[:3] == b"\xff\xd8\xff"
    assert (result.width, result.height) == (64, 48)


def test_strips_exif_and_gps() -> None:
    source = jpeg_with_gps()
    assert len(Image.open(io.BytesIO(source)).getexif()) > 0
    result = sanitize_image(source, max_bytes=LIMIT)
    cleaned = Image.open(io.BytesIO(result.data))
    assert len(cleaned.getexif()) == 0
    assert b"SecretCameraMaker" not in result.data


def test_downscales_long_edge() -> None:
    big = make_image("PNG", size=(MAX_LONG_EDGE + 400, 300))
    result = sanitize_image(big, max_bytes=LIMIT)
    assert max(result.width, result.height) == MAX_LONG_EDGE
    assert result.width > result.height


def test_transparent_png_is_flattened() -> None:
    buffer = io.BytesIO()
    Image.new("RGBA", (20, 20), (0, 255, 0, 0)).save(buffer, format="PNG")
    result = sanitize_image(buffer.getvalue(), max_bytes=LIMIT)
    assert Image.open(io.BytesIO(result.data)).mode == "RGB"


def test_applies_exif_orientation_before_stripping() -> None:
    exif = Image.Exif()
    exif[0x0112] = 6  # rotate 270 when displayed
    buffer = io.BytesIO()
    Image.new("RGB", (60, 20), (1, 2, 3)).save(buffer, format="JPEG", exif=exif)
    result = sanitize_image(buffer.getvalue(), max_bytes=LIMIT)
    assert (result.width, result.height) == (20, 60)


def test_rejects_oversize_payload() -> None:
    assert _code(make_image(), max_bytes=100) is ErrorCode.PAYLOAD_TOO_LARGE


def test_rejects_empty() -> None:
    assert _code(b"") is ErrorCode.INVALID_IMAGE


@pytest.mark.parametrize(
    "raw", [b"hello world, not an image", b"GIF89a" + b"\x00" * 40, b"%PDF-1.7"]
)
def test_rejects_unsupported_magic_bytes(raw: bytes) -> None:
    assert _code(raw) is ErrorCode.UNSUPPORTED_MEDIA_TYPE


def test_rejects_truncated_image() -> None:
    assert _code(make_image("PNG")[:40]) is ErrorCode.INVALID_IMAGE


def test_rejects_jpeg_magic_with_garbage_body() -> None:
    assert _code(b"\xff\xd8\xff\xe0" + b"garbage" * 20) is ErrorCode.INVALID_IMAGE


def test_rejects_pixel_bombs_from_the_header() -> None:
    side = int(MAX_PIXELS**0.5) + 10
    buffer = io.BytesIO()
    Image.new("1", (side, side)).save(buffer, format="PNG")
    assert _code(buffer.getvalue()) is ErrorCode.INVALID_IMAGE
