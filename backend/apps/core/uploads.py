"""
Upload validation shared by every endpoint that accepts files.

The declared content type is not trusted on its own: the first bytes of the
file must match the signature of an allowed type (JPEG, PNG, WebP, PDF).
"""
import mimetypes

from django.http import FileResponse
from rest_framework.exceptions import ValidationError

MAX_UPLOAD_BYTES = 8 * 1024 * 1024
IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
DOCUMENT_TYPES = IMAGE_TYPES | {"application/pdf"}

_SIGNATURES = {
    "image/jpeg": lambda b: b.startswith(b"\xff\xd8\xff"),
    "image/png": lambda b: b.startswith(b"\x89PNG\r\n\x1a\n"),
    "image/webp": lambda b: b[:4] == b"RIFF" and b[8:12] == b"WEBP",
    "application/pdf": lambda b: b.startswith(b"%PDF-"),
}


def sniff(upload) -> str | None:
    """Content type detected from the file's first bytes (None if unknown)."""
    pos = upload.tell() if hasattr(upload, "tell") else 0
    head = upload.read(16)
    upload.seek(pos)
    for ctype, matches in _SIGNATURES.items():
        if matches(head):
            return ctype
    return None


def validate_upload(upload, *, field: str = "file", allowed: set[str] = DOCUMENT_TYPES,
                    max_bytes: int = MAX_UPLOAD_BYTES) -> str:
    """Return the verified content type, or raise a 400 validation error."""
    if not upload:
        raise ValidationError({field: ["Choose a file to upload."]})
    kinds = "a JPEG, PNG or WebP image" if allowed <= IMAGE_TYPES else "a JPEG, PNG, WebP image or a PDF"
    declared = upload.content_type or mimetypes.guess_type(upload.name)[0] or ""
    if declared not in allowed:
        raise ValidationError({field: [f"Upload {kinds}."]})
    if upload.size > max_bytes:
        raise ValidationError({field: [f"Files must be {max_bytes // (1024 * 1024)} MB or smaller."]})
    actual = sniff(upload)
    if actual is None or actual not in allowed:
        raise ValidationError({field: ["The file's contents don't match an allowed file type."]})
    return actual


def file_response(fieldfile, content_type: str = ""):
    """Serve a stored file through an authenticated API view (never a public media URL)."""
    response = FileResponse(fieldfile.open("rb"), content_type=content_type or "application/octet-stream")
    response["Cache-Control"] = "private, max-age=300"
    response["X-Content-Type-Options"] = "nosniff"
    return response
