from __future__ import annotations

import hashlib
from io import BytesIO

import pytest
from PIL import Image
from tools.seed_images import (
    ImageRejectedError,
    corruption_ratio,
    process_image,
    sniff_image_type,
)


def _encode(image: Image.Image, fmt: str, **kwargs: object) -> bytes:
    buffer = BytesIO()
    image.save(buffer, format=fmt, **kwargs)
    return buffer.getvalue()


def _png_bytes(size: tuple[int, int] = (64, 48), mode: str = "RGB") -> bytes:
    return _encode(Image.new(mode, size, (20, 140, 60)), "PNG")


def test_sniff_detects_formats_by_magic_bytes() -> None:
    assert sniff_image_type(_png_bytes()) == "png"
    assert sniff_image_type(_encode(Image.new("RGB", (8, 8)), "JPEG")) == "jpeg"
    assert sniff_image_type(_encode(Image.new("RGB", (8, 8)), "WEBP")) == "webp"
    assert sniff_image_type(b"GIF89a....") is None
    assert sniff_image_type(b"") is None


def test_png_named_jpg_is_sniffed_as_png_and_reencoded_as_jpeg() -> None:
    # The filename lies; only the bytes count. The dump had many such rows.
    filename = "tomato-mosaic-virus (1).jpg"
    data = _png_bytes()
    assert filename.endswith(".jpg")
    assert sniff_image_type(data) == "png"
    processed = process_image(data)
    assert processed.source_format == "png"
    assert processed.data[:3] == b"\xff\xd8\xff"
    assert sniff_image_type(processed.data) == "jpeg"


def test_process_resizes_long_edge_to_1280_and_keeps_aspect() -> None:
    processed = process_image(_png_bytes((3000, 1500)))
    assert (processed.width, processed.height) == (1280, 640)
    with Image.open(BytesIO(processed.data)) as check:
        assert check.size == (1280, 640)


def test_process_never_upscales_small_images() -> None:
    processed = process_image(_png_bytes((200, 100)))
    assert (processed.width, processed.height) == (200, 100)


def test_process_flattens_transparency_and_drops_exif() -> None:
    source = Image.new("RGBA", (40, 40), (255, 0, 0, 0))
    exif = Image.Exif()
    exif[0x010F] = "SecretCamera"
    data = _encode(source, "PNG", exif=exif)
    processed = process_image(data)
    with Image.open(BytesIO(processed.data)) as check:
        assert check.mode == "RGB"
        assert not check.getexif()


def test_process_applies_exif_orientation() -> None:
    source = Image.new("RGB", (60, 20), (10, 200, 10))
    exif = Image.Exif()
    exif[0x0112] = 6  # rotate 90 degrees clockwise to display
    data = _encode(source, "JPEG", exif=exif)
    processed = process_image(data)
    assert (processed.width, processed.height) == (20, 60)


def test_process_is_deterministic_and_hash_matches_output() -> None:
    first = process_image(_png_bytes())
    second = process_image(_png_bytes())
    assert first.data == second.data
    assert first.sha256 == hashlib.sha256(first.data).hexdigest()


def test_unknown_format_is_rejected() -> None:
    with pytest.raises(ImageRejectedError, match="format"):
        process_image(b"not an image at all")


def test_truncated_image_is_rejected() -> None:
    data = _encode(Image.effect_noise((256, 256), 80).convert("RGB"), "JPEG")
    with pytest.raises(ImageRejectedError, match="decode"):
        process_image(data[: len(data) // 2])


def test_blob_with_lost_bytes_is_rejected() -> None:
    lossy = b"\xef\xbf\xbdPNG\r\n\x1a\n" + b"\xef\xbf\xbd" * 50
    with pytest.raises(ImageRejectedError):
        process_image(lossy)
    assert corruption_ratio(lossy) > 0.8


def test_corruption_ratio_is_zero_for_clean_bytes() -> None:
    assert corruption_ratio(_png_bytes()) == 0.0
    assert corruption_ratio(b"") == 0.0
