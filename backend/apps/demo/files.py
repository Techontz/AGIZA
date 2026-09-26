"""Tiny, dependency-free generators for demo image and PDF files (real, valid files)."""
import math
import struct
import zlib

from django.core.files.base import ContentFile

from apps.core.pdf import pdf


def _chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)


def png(width: int, height: int, pixel) -> bytes:
    """PNG from `pixel(x, y) -> (r, g, b)`."""
    rows = bytearray()
    for y in range(height):
        rows.append(0)
        for x in range(width):
            rows.extend(pixel(x, y))
    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + _chunk(b"IHDR", header) + _chunk(b"IDAT", zlib.compress(bytes(rows), 9)) + \
        _chunk(b"IEND", b"")


def signature_png(seed: int = 1) -> ContentFile:
    """A handwritten-looking stroke on white (300×100)."""
    def pixel(x, y):
        curve = 50 + 22 * math.sin(x / (11 + seed)) * math.cos(x / 37)
        return (30, 41, 59) if abs(y - curve) < 2.2 and 20 < x < 280 else (255, 255, 255)
    return ContentFile(png(300, 100, pixel), name=f"signature-{seed}.png")


def parcel_photo(seed: int = 1) -> ContentFile:
    """A simple parcel illustration (400×300): box on a floor."""
    tones = [(214, 170, 110), (190, 150, 95), (170, 130, 80)]
    box = tones[seed % len(tones)]

    def pixel(x, y):
        if 90 < x < 310 and 80 < y < 250:
            if abs(x - 200) < 12 or abs(y - 120) < 6:
                return (225, 215, 190)  # tape
            return box
        return (236, 239, 244) if y < 250 else (203, 208, 216)
    return ContentFile(png(400, 300, pixel), name=f"delivery-photo-{seed}.png")


def pdf_file(name: str, title: str, lines: list[str]) -> ContentFile:
    return ContentFile(pdf(title, lines), name=name)


def product_image(seed: int, rgb: tuple[int, int, int]) -> ContentFile:
    """A clean product tile (400×400): soft background and a rounded device silhouette."""
    r, g, b = rgb

    def pixel(x, y):
        dx, dy = abs(x - 200), abs(y - 200)
        inside = dx < 110 and dy < 150 and not (dx > 90 and dy > 130 and (dx - 90) ** 2 + (dy - 130) ** 2 > 400)
        if inside:
            return (r, g, b) if dy < 135 else (max(r - 40, 0), max(g - 40, 0), max(b - 40, 0))
        shade = 244 - (y * 12) // 400
        return (shade, shade, min(shade + 4, 255))
    return ContentFile(png(400, 400, pixel), name=f"product-{seed}.png")
