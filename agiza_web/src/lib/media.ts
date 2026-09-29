/**
 * The API returns absolute media URLs on the Django host. Browsers load them from this
 * website instead: public product and store images through /img/* (resized by next/image),
 * a vendor's private images through the signed-in proxy.
 */
const PATTERNS: [RegExp, string][] = [
  [/https?:\/\/[^"/\s]+\/api\/app\/images\/(\d+)\//g, "/img/p/$1"],
  [/https?:\/\/[^"/\s]+\/api\/app\/stores\/([\w-]+)\/(logo|banner)\//g, "/img/s/$1/$2"],
  [/https?:\/\/[^"/\s]+\/api\/app\/seller\/images\/(\d+)\//g, "/api/proxy/seller/images/$1"],
  [/https?:\/\/[^"/\s]+\/api\/app\/seller\/store\/(logo|banner)\//g, "/api/proxy/seller/store/$1"],
];

export function rewriteMediaUrls(text: string): string {
  let out = text;
  for (const [pattern, replacement] of PATTERNS) out = out.replace(pattern, replacement);
  return out;
}
