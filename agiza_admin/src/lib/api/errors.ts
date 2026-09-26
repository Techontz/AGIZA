import { ApiError } from "./client";

/** Human-readable message for an API failure (field errors first). */
export function errorText(err: unknown): string {
  if (err instanceof ApiError) {
    const fields = Object.values(err.fieldErrors);
    return fields.length ? fields.join(" ") : err.message;
  }
  return err instanceof Error ? err.message : "Something went wrong";
}

/** Field errors of a 400 response ({} otherwise). */
export function fieldErrors(err: unknown): Record<string, string> {
  return err instanceof ApiError ? err.fieldErrors : {};
}
