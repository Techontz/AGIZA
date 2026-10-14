"""Product video links: validation, canonical form, embeds, and the admin / seller / customer APIs."""
import pytest

from apps.catalog.video import VideoUrlError, parse

pytestmark = pytest.mark.django_db
YT = "dQw4w9WgXcQ"
TT = "7231338487075638570"


@pytest.mark.parametrize("raw, provider, url", [
    (f"https://www.youtube.com/watch?v={YT}&t=42s&si=abc", "youtube", f"https://www.youtube.com/watch?v={YT}"),
    (f"youtu.be/{YT}?si=x", "youtube", f"https://www.youtube.com/watch?v={YT}"),
    (f"https://m.youtube.com/shorts/{YT}", "youtube", f"https://www.youtube.com/shorts/{YT}"),
    (f"https://www.tiktok.com/@agiza.tz/video/{TT}?is_from_webapp=1", "tiktok",
     f"https://www.tiktok.com/@agiza.tz/video/{TT}"),
    ("https://www.instagram.com/reel/C8abc_12-Xy/?igsh=zzz", "instagram", "https://www.instagram.com/reel/C8abc_12-Xy/"),
    ("https://instagram.com/p/C8abc12Xy/", "instagram", "https://www.instagram.com/p/C8abc12Xy/"),
])
def test_supported_links_are_normalised(raw, provider, url):
    video = parse(raw)
    assert video.provider == provider and video.url == url


def test_embeds_are_built_from_the_id_only():
    yt = parse(f"https://www.youtube.com/shorts/{YT}").payload
    assert yt["embed_url"].startswith(f"https://www.youtube-nocookie.com/embed/{YT}?autoplay=1&mute=1")
    assert yt["thumbnail_url"] == f"https://i.ytimg.com/vi/{YT}/hqdefault.jpg" and yt["vertical"] is True
    tt = parse(f"https://www.tiktok.com/@a/video/{TT}").payload
    assert tt["embed_url"].startswith(f"https://www.tiktok.com/player/v1/{TT}?autoplay=1&muted=1")
    ig = parse("https://www.instagram.com/reel/C8abc12Xy/").payload
    assert ig["embeddable"] is False and ig["embed_url"] is None  # preview that opens the original


@pytest.mark.parametrize("raw", [
    "https://vimeo.com/123", "javascript:alert(1)", f"https://evil.com/watch?v={YT}",
    f"https://www.youtube.com.evil.com/watch?v={YT}", "https://www.youtube.com/watch?v=short",
    'https://www.youtube.com/watch?v=abc"><script>', "https://vm.tiktok.com/ZMabc/",
    "https://www.tiktok.com/@a/video/notanumber", "https://www.instagram.com/agiza.tz/",
    f"https://user:pw@youtube.com/watch?v={YT}", "https://x.com/" + "a" * 600,
])
def test_unsupported_or_unsafe_links_are_refused(raw):
    with pytest.raises(VideoUrlError):
        parse(raw)


def test_admin_sets_changes_and_removes_a_video_and_customers_see_it(client_for):
    from rest_framework.test import APIClient

    from apps.catalog.models import Category, Product

    app = APIClient()  # the product page is public
    APP = "/api/app"  # noqa: N806
    admin = client_for("admin_l2")
    cat = Category.objects.create(name="Phones")
    body = {"name": "Phone", "sku": "VID-1", "category": cat.id, "price": "1000", "status": "active",
            "video_url": "https://youtube.com/shorts/" + YT + "?feature=share"}
    res = admin.post("/api/catalog/products/", body, format="json")
    assert res.status_code == 201, res.json()
    pid = res.json()["id"]
    assert res.json()["video_url"] == f"https://www.youtube.com/shorts/{YT}"
    assert res.json()["video"]["provider"] == "youtube"
    assert Product.objects.get(pk=pid).video_provider == "youtube"
    shop = app.get(f"{APP}/products/{pid}/").json()
    assert shop["video"]["embeddable"] is True and shop["video"]["embed_url"].startswith("https://www.youtube-nocookie")
    bad = admin.patch(f"/api/catalog/products/{pid}/", {"video_url": "https://vimeo.com/1"}, format="json")
    assert bad.status_code == 400 and "YouTube, TikTok or Instagram" in str(bad.json())
    admin.patch(f"/api/catalog/products/{pid}/", {"video_url": ""}, format="json")
    assert app.get(f"{APP}/products/{pid}/").json()["video"] is None
    assert Product.objects.get(pk=pid).video_provider == ""
