"""Photos, files and voice notes in chat (app ↔ admin), Quick Quotation, and the admin's unread badge."""
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.chat.models import Conversation, MessageAttachment
from apps.quotes.models import QuoteRequest

from .conftest import APP

pytestmark = pytest.mark.django_db

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
M4A = b"\x00\x00\x00\x20ftypM4A " + b"\x00" * 64  # AAC voice note in an MP4 container (the app's recorder)
WEBM = b"\x1a\x45\xdf\xa3" + b"\x00" * 64  # browser recorder (admin)
PDF = b"%PDF-1.7\n" + b"\x00" * 64


def upload(name, data, ctype):
    return SimpleUploadedFile(name, data, content_type=ctype)


@pytest.fixture
def media(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path


@pytest.mark.usefixtures("media")
def test_customer_sends_a_photo_and_a_voice_note_staff_reply_with_a_file(app, other_app, client_for):
    photo = app.post(f"{APP}/support/messages/", {"file": upload("box.png", PNG, "image/png")}, format="multipart")
    assert photo.status_code == 201, photo.json()
    [att] = photo.json()["attachments"]
    assert att["kind"] == "image" and att["url"].endswith(f"/api/app/support/attachments/{att['id']}/")
    voice = app.post(f"{APP}/support/messages/", {"file": upload("note.m4a", M4A, "audio/mp4"), "duration_ms": 4200,
                                                  "body": ""}, format="multipart")
    assert voice.status_code == 201 and voice.json()["attachments"][0]["duration_ms"] == 4200
    assert voice.json()["attachments"][0]["kind"] == "voice"
    # The customer opens their own files; nobody else can.
    res = app.get(att["url"])
    assert res.status_code == 200 and b"".join(res.streaming_content) == PNG
    assert other_app.get(att["url"]).status_code == 404
    # Bad files are refused: a "PNG" that isn't, and an executable.
    fake = app.post(f"{APP}/support/messages/", {"file": upload("x.png", b"MZ" + b"\x00" * 64, "image/png")},
                    format="multipart")
    assert fake.status_code == 400
    exe = app.post(f"{APP}/support/messages/", {"file": upload("x.exe", b"MZ" * 40, "application/x-msdownload")},
                   format="multipart")
    assert exe.status_code == 400

    conv = Conversation.objects.get()
    assert conv.last_message_preview == "🎤 Voice message"
    staff = client_for("admin_l2")
    unread = staff.get("/api/chat/conversations/unread/").json()
    assert unread["conversations"] == 1
    thread = staff.get(f"/api/chat/conversations/{conv.pk}/messages/").json()
    kinds = [a["kind"] for m in thread for a in m["attachments"]]
    assert kinds == ["image", "voice"]
    staff_url = thread[0]["attachments"][0]["url"]
    assert staff_url == f"chat/attachments/{att['id']}/file"
    assert staff.get(f"/api/{staff_url}/").status_code == 200

    sent = staff.post(f"/api/chat/conversations/{conv.pk}/send/",
                      {"file": upload("invoice.pdf", PDF, "application/pdf"), "body": "Your invoice"},
                      format="multipart")
    assert sent.status_code == 201, sent.json()
    assert sent.json()["attachments"][0]["name"] == "invoice.pdf"
    reply = staff.post(f"/api/chat/conversations/{conv.pk}/send/",
                       {"file": upload("voice.webm", WEBM, "audio/webm")}, format="multipart")
    assert reply.status_code == 201 and reply.json()["attachments"][0]["kind"] == "voice"
    # Replying marks it read for the team.
    assert staff.get("/api/chat/conversations/unread/").json()["conversations"] == 0
    mine = app.get(f"{APP}/support/messages/").json()["messages"]
    assert [m["attachments"][0]["kind"] for m in mine[-2:]] == ["file", "voice"]
    assert MessageAttachment.objects.count() == 4


def test_quick_quotation_from_chat_reaches_the_app(app, client_for):
    app.post(f"{APP}/support/messages/", {"body": "How much to ship 3 laptops from Dubai?"}, format="json")
    conv = Conversation.objects.get()
    staff = client_for("admin_l2")
    res = staff.post(f"/api/chat/conversations/{conv.pk}/quick-quote/", {
        "service_type": "international", "description": "3 laptops from Dubai", "amount": "450000",
        "estimated_delivery": "2026-11-20", "notes": "Air freight, 10 days"}, format="json")
    assert res.status_code == 201, res.json()
    card = res.json()["quotation"]
    assert card["amount"] == "450000.00" and card["status"] == "waiting_reply"
    quote = QuoteRequest.objects.get(pk=card["id"])
    assert quote.customer_id == app.account.customer_id and quote.response_notes == "Air freight, 10 days"
    shown = app.get(f"{APP}/support/messages/").json()["messages"]
    cards = [m["quotation"] for m in shown if m["quotation"]]
    assert cards and cards[0]["can_reply"] is True and cards[0]["reference"] == quote.reference
    assert staff.post(f"/api/chat/conversations/{conv.pk}/quick-quote/", {
        "service_type": "international", "description": "x", "amount": "0"}, format="json").status_code == 400
