"use client";

import { useEffect, useState } from "react";

import { errorText, fieldErrors } from "@/lib/api/errors";

/**
 * API error summary for a dialog. Field errors shown next to their inputs
 * (`shown`) are left out; everything else (non-field errors, 409 conflicts,
 * network failures) is displayed here.
 */
export function FormAlert({ error, shown = [] }: { error: unknown; shown?: string[] }) {
  if (!error) return null;
  const fields = fieldErrors(error);
  const keys = Object.keys(fields);
  const message = keys.length
    ? keys
        .filter((k) => !shown.includes(k))
        .map((k) => fields[k])
        .join(" ")
    : errorText(error);
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
      {message}
    </p>
  );
}

/** Merge client-side checks with the API's field errors (client wins). */
export function mergedErrors(error: unknown, local: Record<string, string>): Record<string, string> {
  return { ...fieldErrors(error), ...local };
}

/** ISO timestamp → value for <input type="datetime-local"> (local time). */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** <input type="datetime-local"> value → ISO timestamp (or null when empty). */
export function fromLocalInput(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

/** Object URLs for image previews, revoked when the files change or on unmount. */
export function useObjectUrls(files: File[]): string[] {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const next = files.map((f) => URL.createObjectURL(f));
    setUrls(next);
    return () => next.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);
  return urls;
}

export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
