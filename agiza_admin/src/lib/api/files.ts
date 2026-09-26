/**
 * Stored files (photos, signatures, documents) are served by Django only to
 * signed-in staff, through the same-origin proxy that carries the session.
 */
export const fileSrc = (apiPath: string) => `/api/proxy/${apiPath.replace(/^\/+/, "")}`;
