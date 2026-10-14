"""Minimal, dependency-free PDF writer (single page, Helvetica text)."""


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


# --------------------------------------------------------------------------- #
# Laid-out documents (invoices, receipts): text, lines and filled boxes over several pages
# --------------------------------------------------------------------------- #
# Helvetica advance widths (1/1000 em) for printable ASCII, from the standard AFM metrics.
_W = dict(zip(
    " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~",
    [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, *[556] * 10, 278, 278, 584,
     584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722,
     667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556,
     222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584],
    strict=True,
))
PAGE_W, PAGE_H, MARGIN = 595, 842, 48  # A4 in points


def text_width(text: str, size: float, bold: bool = False) -> float:
    return sum(_W.get(c, 556) for c in text) * size / 1000 * (1.06 if bold else 1)


def wrap(text: str, size: float, width: float, bold: bool = False) -> list[str]:
    """Split text into lines that fit `width` (words longer than a line are cut)."""
    lines, current = [], ""
    for word in (text or "").split():
        trial = f"{current} {word}".strip()
        if text_width(trial, size, bold) <= width:
            current = trial
            continue
        if current:
            lines.append(current)
        while text_width(word, size, bold) > width:  # a very long word
            cut = max(1, int(len(word) * width / text_width(word, size, bold)))
            lines.append(word[:cut])
            word = word[cut:]
        current = word
    if current:
        lines.append(current)
    return lines or [""]


def _esc(text: str) -> str:
    text = text.replace("—", "-").replace("–", "-").replace("’", "'").replace("“", '"').replace("”", '"')
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)").encode("latin-1", "replace").decode("latin-1")


class Canvas:
    """A tiny PDF canvas: y grows downwards from the top of the page (like a screen)."""

    def __init__(self):
        self.pages: list[list[str]] = [[]]

    @property
    def ops(self) -> list[str]:
        return self.pages[-1]

    def new_page(self):
        self.pages.append([])

    @staticmethod
    def _rgb(color: tuple[float, float, float]) -> str:
        return " ".join(f"{c:.3f}" for c in color)

    def text(self, x: float, y: float, text: str, *, size: float = 10, bold: bool = False,
             color=(0.1, 0.1, 0.1), align: str = "left"):
        if align == "right":
            x -= text_width(text, size, bold)
        elif align == "center":
            x -= text_width(text, size, bold) / 2
        font = "F2" if bold else "F1"
        self.ops.append(f"BT {self._rgb(color)} rg /{font} {size} Tf {x:.2f} {PAGE_H - y:.2f} Td ({_esc(text)}) Tj ET")

    def rect(self, x: float, y: float, w: float, h: float, *, fill=(0.95, 0.95, 0.95)):
        self.ops.append(f"{self._rgb(fill)} rg {x:.2f} {PAGE_H - y - h:.2f} {w:.2f} {h:.2f} re f")

    def line(self, x1: float, y1: float, x2: float, y2: float, *, color=(0.85, 0.85, 0.85), width: float = 0.8):
        self.ops.append(f"{self._rgb(color)} RG {width} w {x1:.2f} {PAGE_H - y1:.2f} m {x2:.2f} {PAGE_H - y2:.2f} l S")

    def build(self) -> bytes:
        n = len(self.pages)
        # 1 catalog, 2 pages, 3-4 fonts, then (page, content) pairs.
        kids = " ".join(f"{5 + 2 * i} 0 R" for i in range(n))
        objects = [
            b"<< /Type /Catalog /Pages 2 0 R >>",
            f"<< /Type /Pages /Kids [{kids}] /Count {n} >>".encode(),
            b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
            b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
        ]
        for i, ops in enumerate(self.pages):
            stream = "\n".join(ops).encode("latin-1")
            objects.append(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {PAGE_W} {PAGE_H}] /Contents {6 + 2 * i} 0 R "
                           f"/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>".encode())
            objects.append(b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream")
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
