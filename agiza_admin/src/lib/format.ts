/** Formatting helpers matching the Figma Make output (e.g. "TSh 25,000"). */

const LOCALE = "en-US";

export function formatTSh(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined || amount === "") return "—";
  const value = typeof amount === "string" ? Number(amount) : amount;
  return `TSh ${value.toLocaleString(LOCALE, { maximumFractionDigits: 2 })}`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(LOCALE);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(LOCALE);
}

/** "3h ago", "2d ago": used for "Last Update" style columns. */
export function timeAgo(value: string | null | undefined): string {
  if (!value) return "—";
  const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function titleCase(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
