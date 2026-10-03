"""Image sniffing and normalization for seed images.

Filenames and mime types in the DAHON dump are unreliable (PNG data named .jpg,
WEBP named .jpg), so the format comes from magic bytes only. Every image is
decoded, oriented, flattened to RGB, resized to a 1280px long edge and
re-encoded as a JPEG without metadata, so the stored bytes are deterministic.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from io import BytesIO

from PIL import Image, ImageOps, UnidentifiedImageError

MAX_EDGE = 1280
JPEG_QUALITY = 82
MAX_PIXELS = 40_000_000
_REPLACEMENT_UTF8 = b"\xef\xbf\xbd"


class ImageRejectedError(ValueError):
    """The bytes are not a usable image."""


@dataclass(frozen=True)
class ProcessedImage:
    data: bytes
    sha256: str
    width: int
    height: int
    source_format: str


def sniff_image_type(data: bytes) -> str | None:
    """Return ``jpeg``, ``png``, ``webp`` or ``None`` from magic bytes."""
    if data[:3] == b"\xff\xd8\xff":
        return "jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return None


def corruption_ratio(data: bytes) -> float:
    """Share of the bytes that are UTF-8 replacement characters (lost data)."""
    if not data:
        return 0.0
    return data.count(_REPLACEMENT_UTF8) * len(_REPLACEMENT_UTF8) / len(data)


def _decode(data: bytes) -> Image.Image:
    try:
        with Image.open(BytesIO(data)) as opened:
            if opened.width * opened.height > MAX_PIXELS:
                raise ImageRejectedError("image has too many pixels")
            opened.load()
            return ImageOps.exif_transpose(opened)
    except ImageRejectedError:
        raise
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError) as exc:
        raise ImageRejectedError(f"cannot decode image: {type(exc).__name__}") from exc


def _flatten(image: Image.Image) -> Image.Image:
    if image.mode in ("RGBA", "LA", "P"):
        rgba = image.convert("RGBA")
        canvas = Image.new("RGB", rgba.size, (255, 255, 255))
        canvas.paste(rgba, mask=rgba.getchannel("A"))
        return canvas
    return image.convert("RGB")


def process_image(data: bytes, max_edge: int = MAX_EDGE) -> ProcessedImage:
    """Validate, resize and re-encode ``data`` as a metadata free JPEG."""
    source_format = sniff_image_type(data)
    if source_format is None:
        raise ImageRejectedError("unknown image format (magic bytes do not match)")
    image = _flatten(_decode(data))
    image.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
    buffer = BytesIO()
    image.save(buffer, format="JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
    encoded = buffer.getvalue()
    return ProcessedImage(
        data=encoded,
        sha256=hashlib.sha256(encoded).hexdigest(),
        width=image.width,
        height=image.height,
        source_format=source_format,
    )
