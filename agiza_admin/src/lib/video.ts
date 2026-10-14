/**
 * Product video links (YouTube, TikTok, Instagram): a quick client-side hint while typing.
 * The server (backend/apps/catalog/video.py) does the real validation and stores the canonical link.
 */
export type VideoProvider = "youtube" | "tiktok" | "instagram";

export const VIDEO_PROVIDER_LABEL: Record<VideoProvider, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram (shown as a preview)",
};

export function detectVideoProvider(raw: string): VideoProvider | null {
  const text = raw.trim();
  if (!text) return null;
  let host = "";
  try {
    host = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "music.youtube.com"].includes(host)) return "youtube";
  if (["tiktok.com", "www.tiktok.com", "m.tiktok.com", "vm.tiktok.com", "vt.tiktok.com"].includes(host)) return "tiktok";
  if (["instagram.com", "www.instagram.com", "m.instagram.com"].includes(host)) return "instagram";
  return null;
}
