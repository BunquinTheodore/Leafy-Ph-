"""Upload validation and sanitizing: sniff, decode, orient, resize and re-encode as clean JPEG.

Re-encoding drops EXIF (including GPS), ICC and any trailing payload. Nothing the client sent
other than the pixels survives.
"""

import io
from dataclasses import dataclass

from PIL import Image, ImageOps, UnidentifiedImageError

from app.core.errors import AppError, ErrorCode

MAX_PIXELS = 40_000_000
MAX_LONG_EDGE = 2048
JPEG_QUALITY = 90
CONTENT_TYPE = "image/jpeg"

_MIN_HEADER = 12
_FORMAT_BY_SNIFF = {"JPEG": "JPEG", "PNG": "PNG", "WEBP": "WEBP"}


@dataclass(frozen=True)
class SanitizedImage:
    data: bytes
    width: int
    height: int
    content_type: str = CONTENT_TYPE


def sniff_format(raw: bytes) -> str | None:
    """Identify JPEG, PNG or WebP from the first bytes, ignoring any name or declared type."""
    if raw[:3] == b"\xff\xd8\xff":
        return "JPEG"
    if raw[:8] == b"\x89PNG\r\n\x1a\n":
        return "PNG"
    if raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        return "WEBP"
    return None


def _invalid() -> AppError:
    return AppError(ErrorCode.INVALID_IMAGE)


def _check_header(raw: bytes, max_bytes: int) -> str:
    if len(raw) > max_bytes:
        raise AppError(ErrorCode.PAYLOAD_TOO_LARGE)
    if not raw:
        raise _invalid()
    sniffed = sniff_format(raw) if len(raw) >= _MIN_HEADER else None
    if sniffed is None:
        raise AppError(ErrorCode.UNSUPPORTED_MEDIA_TYPE)
    return sniffed


def _verify_and_size(raw: bytes, expected_format: str) -> None:
    """Cheap structural checks that never decode the full pixel data."""
    with Image.open(io.BytesIO(raw)) as probe:
        if probe.format != _FORMAT_BY_SNIFF[expected_format]:
            raise _invalid()
        width, height = probe.size
        if width < 1 or height < 1 or width * height > MAX_PIXELS:
            raise _invalid()
        probe.verify()


def _flatten(image: Image.Image) -> Image.Image:
    if image.mode in {"RGBA", "LA"} or (image.mode == "P" and "transparency" in image.info):
        rgba = image.convert("RGBA")
        canvas = Image.new("RGB", rgba.size, (255, 255, 255))
        canvas.paste(rgba, mask=rgba.getchannel("A"))
        return canvas
    return image.convert("RGB")


def _reencode(raw: bytes) -> SanitizedImage:
    with Image.open(io.BytesIO(raw)) as decoded:
        decoded.load()
        oriented = ImageOps.exif_transpose(decoded)
        rgb = _flatten(oriented)
    rgb.thumbnail((MAX_LONG_EDGE, MAX_LONG_EDGE), Image.Resampling.LANCZOS)
    buffer = io.BytesIO()
    rgb.save(buffer, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    return SanitizedImage(data=buffer.getvalue(), width=rgb.width, height=rgb.height)


def sanitize_image(raw: bytes, *, max_bytes: int) -> SanitizedImage:
    """Validate an upload and return a clean JPEG, or raise AppError (413, 415 or 422).

    CPU bound: callers on the event loop should run it in a worker thread.
    """
    sniffed = _check_header(raw, max_bytes)
    try:
        _verify_and_size(raw, sniffed)
        return _reencode(raw)
    except AppError:
        raise
    except (
        UnidentifiedImageError,
        Image.DecompressionBombError,
        OSError,
        SyntaxError,
        ValueError,
        EOFError,
    ) as exc:
        raise _invalid() from exc
