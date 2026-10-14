"""
Product videos: a link to YouTube, TikTok or Instagram, shown as the small floating player on the
product page (web and app).

Nothing is downloaded or re-hosted. A pasted link is accepted only when its host is one of the known
providers and its video id matches the provider's format; the canonical link and the embed link are
then rebuilt from that id alone, so no text from the seller ever reaches an iframe.

  - YouTube (videos, Shorts): embeddable — muted autoplay, looping, no controls (youtube-nocookie.com).
  - TikTok (…/@user/video/<id>): embeddable through TikTok's official player (player/v1).
  - Instagram (reels, posts): Instagram's embed is a full card that doesn't fit a small player, so it
    is shown as a preview that opens the original.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import parse_qs, urlparse

MAX_LENGTH = 500


class VideoUrlError(ValueError):
    pass


@dataclass(frozen=True)
class Video:
    provider: str  # youtube | tiktok | instagram
    video_id: str
    url: str  # canonical link to the original
    embed_url: str | None  # None: preview only (opens `url`)
    thumbnail_url: str | None
    vertical: bool

    @property
    def payload(self) -> dict:
        return {"provider": self.provider, "id": self.video_id, "url": self.url, "embed_url": self.embed_url,
                "thumbnail_url": self.thumbnail_url, "embeddable": self.embed_url is not None,
                "vertical": self.vertical}


YOUTUBE_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be",
                 "www.youtube-nocookie.com", "youtube-nocookie.com"}
TIKTOK_HOSTS = {"tiktok.com", "www.tiktok.com", "m.tiktok.com"}
TIKTOK_SHORT_HOSTS = {"vm.tiktok.com", "vt.tiktok.com"}
INSTAGRAM_HOSTS = {"instagram.com", "www.instagram.com", "m.instagram.com"}

YT_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")
TT_ID = re.compile(r"^\d{10,25}$")
TT_USER = re.compile(r"^@[A-Za-z0-9._]{1,40}$")
IG_CODE = re.compile(r"^[A-Za-z0-9_-]{5,40}$")

SUPPORTED = "Paste a YouTube, TikTok or Instagram video link."


def _youtube(parts, path: list[str]) -> Video:
    host = parts.hostname
    vid, short = None, False
    if host == "youtu.be":
        vid = path[0] if path else None
    elif path[:1] == ["watch"]:
        vid = (parse_qs(parts.query).get("v") or [None])[0]
    elif path[:1] in (["shorts"], ["embed"], ["live"], ["v"]) and len(path) >= 2:
        vid, short = path[1], path[0] == "shorts"
    if not vid or not YT_ID.match(vid):
        raise VideoUrlError("That YouTube link has no video in it. Open the video and copy its link.")
    url = f"https://www.youtube.com/shorts/{vid}" if short else f"https://www.youtube.com/watch?v={vid}"
    embed = (f"https://www.youtube-nocookie.com/embed/{vid}?autoplay=1&mute=1&playsinline=1&loop=1"
             f"&playlist={vid}&controls=0&modestbranding=1&rel=0")
    return Video("youtube", vid, url, embed, f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg", short)


def _tiktok(parts, path: list[str]) -> Video:
    if parts.hostname in TIKTOK_SHORT_HOSTS:
        raise VideoUrlError("Short TikTok links (vm.tiktok.com) can't be checked. Open the video in a browser and "
                            "copy the full link (tiktok.com/@name/video/…).")
    vid, user = None, None
    if len(path) >= 3 and path[1] == "video" and TT_USER.match(path[0]):
        user, vid = path[0], path[2]
    elif len(path) >= 3 and path[:2] == ["player", "v1"]:
        vid = path[2]
    elif len(path) >= 3 and path[:2] == ["embed", "v2"]:
        vid = path[2]
    if not vid or not TT_ID.match(vid):
        raise VideoUrlError("That TikTok link has no video in it. Copy the link of the video itself "
                            "(tiktok.com/@name/video/…).")
    url = f"https://www.tiktok.com/{user}/video/{vid}" if user else f"https://www.tiktok.com/player/v1/{vid}"
    embed = (f"https://www.tiktok.com/player/v1/{vid}?autoplay=1&muted=1&loop=1&controls=0&progress_bar=0"
             f"&play_button=0&volume_control=0&fullscreen_button=0&timestamp=0&music_info=0&description=0"
             f"&rel=0&native_context_menu=0&closed_caption=0")
    return Video("tiktok", vid, url, embed, None, True)


def _instagram(parts, path: list[str]) -> Video:
    if len(path) >= 2 and path[0] in ("reel", "reels", "p", "tv") and IG_CODE.match(path[1]):
        kind = "reel" if path[0] in ("reel", "reels") else path[0]
        code = path[1]
        return Video("instagram", code, f"https://www.instagram.com/{kind}/{code}/", None, None, kind == "reel")
    raise VideoUrlError("That Instagram link has no reel or post in it. Copy the link of the reel itself.")


def parse(raw: str) -> Video:
    """The video behind a pasted link, or VideoUrlError with what to do instead."""
    text = (raw or "").strip()
    if not text:
        raise VideoUrlError(SUPPORTED)
    if len(text) > MAX_LENGTH:
        raise VideoUrlError("That link is too long.")
    if not re.match(r"^https?://", text, re.I):
        text = f"https://{text}"
    parts = urlparse(text)
    if parts.scheme.lower() not in ("http", "https") or not parts.hostname or parts.username or parts.password:
        raise VideoUrlError(SUPPORTED)
    host = parts.hostname.lower()
    path = [p for p in parts.path.split("/") if p]
    if host in YOUTUBE_HOSTS:
        return _youtube(parts, path)
    if host in TIKTOK_HOSTS or host in TIKTOK_SHORT_HOSTS:
        return _tiktok(parts, path)
    if host in INSTAGRAM_HOSTS:
        return _instagram(parts, path)
    raise VideoUrlError(SUPPORTED)


def payload(url: str) -> dict | None:
    """What the apps need to show a product's video (None without one, or if the stored link is no longer valid)."""
    if not url:
        return None
    try:
        return parse(url).payload
    except VideoUrlError:
        return None
