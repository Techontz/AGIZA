/**
 * The API returns absolute media URLs on the Django host. Browsers load them from this
 * website instead: public product and store images through /img/* (resized by next/image),
 * a customer's private return photos through the signed-in proxy.
 */
const PATTERNS: [RegExp, string][] = [
  [/https?:\/\/[^"/\s]+\/api\/app\/images\/(\d+)\//g, "/img/p/$1"],
  [/https?:\/\/[^"/\s]+\/api\/app\/stores\/([\w-]+)\/(logo|banner)\//g, "/img/s/$1/$2"],
  [/https?:\/\/[^"/\s]+\/api\/app\/returns\/([\w-]+)\/evidence\/(\d+)\//g, "/api/proxy/returns/$1/evidence/$2"],
];

export function rewriteMediaUrls(text: string): string {
  let out = text;
  for (const [pattern, replacement] of PATTERNS) out = out.replace(pattern, replacement);
  return out;
}
