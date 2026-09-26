"""Tiny, dependency-free generators for demo image and PDF files (real, valid files)."""
import math
import struct
import zlib

from django.core.files.base import ContentFile


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


def pdf(title: str, lines: list[str]) -> bytes:
    """Single-page PDF with a title and a few lines of text."""
    def esc(text: str) -> str:
        return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)").encode("latin-1", "replace").decode("latin-1")

    body = [f"BT /F1 18 Tf 72 740 Td ({esc(title)}) Tj ET"]
    for i, line in enumerate(lines):
        body.append(f"BT /F1 11 Tf 72 {705 - i * 18} Td ({esc(line)}) Tj ET")
    stream = "\n".join(body).encode("latin-1")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R "
        b"/Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, obj in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + obj + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return bytes(out)


def pdf_file(name: str, title: str, lines: list[str]) -> ContentFile:
    return ContentFile(pdf(title, lines), name=name)
