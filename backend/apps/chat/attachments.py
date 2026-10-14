"""
Photos, documents and voice notes in chat (the customer app and the staff inbox).

As for every upload, the declared type isn't trusted: the file's first bytes must match the type's
signature. Voice notes come from the app (AAC in an MP4/M4A container) or from a browser recorder
(WebM/Opus, or MP4 on Safari).
"""
from __future__ import annotations

import mimetypes
import os

from rest_framework.exceptions import ValidationError

from apps.core.uploads import IMAGE_TYPES, sniff

MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_FILE_BYTES = 16 * 1024 * 1024

_ZIP = lambda b: b.startswith(b"PK\x03\x04")  # noqa: E731 (Office files are ZIP archives)
_MP4 = lambda b: b[4:8] == b"ftyp"  # noqa: E731
_SIGNATURES = {
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": _ZIP,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": _ZIP,
    "audio/mp4": _MP4,
    "audio/m4a": _MP4,
    "audio/x-m4a": _MP4,
    "audio/aac": lambda b: _MP4(b) or (b[0] == 0xFF and b[1] & 0xF6 == 0xF0),
    "audio/mpeg": lambda b: b.startswith(b"ID3") or (b[0] == 0xFF and b[1] & 0xE0 == 0xE0),
    "audio/webm": lambda b: b.startswith(b"\x1a\x45\xdf\xa3"),
    "video/webm": lambda b: b.startswith(b"\x1a\x45\xdf\xa3"),  # some browsers label audio-only WebM so
    "audio/ogg": lambda b: b.startswith(b"OggS"),
    "audio/wav": lambda b: b[:4] == b"RIFF" and b[8:12] == b"WAVE",
    "audio/x-wav": lambda b: b[:4] == b"RIFF" and b[8:12] == b"WAVE",
}
DOCUMENT_TYPES = {"application/pdf", *(t for t in _SIGNATURES if t.startswith("application/"))}
AUDIO_TYPES = {t for t in _SIGNATURES if t.startswith(("audio/", "video/webm"))}
ALLOWED = IMAGE_TYPES | DOCUMENT_TYPES | AUDIO_TYPES
EXTENSION = {"audio/mp4": "m4a", "audio/m4a": "m4a", "audio/x-m4a": "m4a", "audio/aac": "aac", "audio/mpeg": "mp3",
             "audio/webm": "webm", "video/webm": "webm", "audio/ogg": "ogg", "audio/wav": "wav", "audio/x-wav": "wav",
             "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
             "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
             "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx"}


def _matches(upload, ctype: str) -> bool:
    if ctype in IMAGE_TYPES or ctype == "application/pdf":
        return sniff(upload) == ctype
    pos = upload.tell() if hasattr(upload, "tell") else 0
    head = upload.read(16)
    upload.seek(pos)
    return len(head) >= 12 and _SIGNATURES[ctype](head)


def validate(upload) -> tuple[str, str]:
    """(content type, kind) of a chat upload — kind is "image", "voice" or "file" — or a 400 error."""
    if not upload:
        raise ValidationError({"file": ["Choose a file to send."]})
    declared = (upload.content_type or mimetypes.guess_type(upload.name)[0] or "").split(";")[0].strip().lower()
    if declared not in ALLOWED:
        raise ValidationError({"file": ["Send a photo (JPEG, PNG, WebP), a PDF, Word or Excel file, or a voice note."]})
    limit = MAX_IMAGE_BYTES if declared in IMAGE_TYPES else MAX_FILE_BYTES
    if upload.size > limit:
        raise ValidationError({"file": [f"Files must be {limit // (1024 * 1024)} MB or smaller."]})
    if not _matches(upload, declared):
        raise ValidationError({"file": ["The file's contents don't match its type."]})
    kind = "image" if declared in IMAGE_TYPES else "voice" if declared in AUDIO_TYPES else "file"
    return declared, kind


def display_name(upload, ctype: str) -> str:
    """The uploader's file name for display only (stored files get random names)."""
    base = os.path.basename(upload.name or "").strip()[:120]
    return base or f"file.{EXTENSION.get(ctype, 'bin')}"


def preview(kind: str, name: str) -> str:
    return {"image": "📷 Photo", "voice": "🎤 Voice message"}.get(kind, f"📎 {name}")


def prepare(upload, duration_ms: int | None = None) -> dict:
    """A validated attachment ready for chat.services (`attachment=`)."""
    ctype, kind = validate(upload)
    return {"file": upload, "content_type": ctype, "kind": kind, "name": display_name(upload, ctype),
            "duration_ms": duration_ms if kind == "voice" else None}
