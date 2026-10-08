/**
 * Phone photos are often 3–10 MB, which is slow on mobile data and over the 4.5 MB request limit of
 * the website's server-side proxy. Before uploading, large photos are redrawn at most MAX_SIDE pixels
 * on their longest side as a JPEG, usually 200–600 KB and still sharp. Anything the browser can't
 * decode (e.g. HEIC outside Safari) or that is already small is sent unchanged.
 */
const MAX_SIDE = 1600;
const QUALITY = 0.82;
const SMALL_ENOUGH = 900 * 1024;

export async function shrinkImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  if (file.size <= SMALL_ENOUGH) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  }
}
