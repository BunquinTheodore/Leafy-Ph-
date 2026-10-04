"""Tiny real images for upload tests."""

import io

from PIL import Image


def make_image(
    fmt: str = "JPEG",
    size: tuple[int, int] = (64, 48),
    colour: tuple[int, int, int] = (20, 140, 40),
) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", size, colour).save(buffer, format=fmt)
    return buffer.getvalue()


def jpeg_with_gps(size: tuple[int, int] = (40, 30)) -> bytes:
    exif = Image.Exif()
    exif[0x010F] = "SecretCameraMaker"
    gps = exif.get_ifd(0x8825)
    gps[1] = "N"
    gps[2] = (14.0, 35.0, 12.0)
    buffer = io.BytesIO()
    Image.new("RGB", size, (10, 200, 10)).save(buffer, format="JPEG", exif=exif)
    return buffer.getvalue()
