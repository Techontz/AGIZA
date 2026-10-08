/**
 * Phone camera photos are often 3–10 MB: slow over mobile data and likely to time out. Before
 * uploading, a photo is redrawn at most MAX_SIDE pixels on its longest side as a JPEG, usually
 * 200–600 KB and still sharp. If anything goes wrong the original photo is sent unchanged.
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

const MAX_SIDE = 1600;

export type PickedPhoto = { uri: string; width?: number; height?: number; mimeType?: string | null; fileName?: string | null };
export type UploadPhoto = { uri: string; mimeType: string; fileName: string };

export async function shrinkPhoto(photo: PickedPhoto): Promise<UploadPhoto> {
  const fallbackType = photo.mimeType ?? 'image/jpeg';
  const original: UploadPhoto = {
    uri: photo.uri,
    mimeType: fallbackType,
    fileName: photo.fileName ?? `photo.${fallbackType.split('/')[1] ?? 'jpg'}`,
  };
  try {
    const context = ImageManipulator.manipulate(photo.uri);
    const width = photo.width ?? 0;
    const height = photo.height ?? 0;
    if (Math.max(width, height) > MAX_SIDE) context.resize(width >= height ? { width: MAX_SIDE } : { height: MAX_SIDE });
    const image = await context.renderAsync();
    const saved = await image.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
    const base = (photo.fileName ?? 'photo').replace(/\.[^.]+$/, '');
    return { uri: saved.uri, mimeType: 'image/jpeg', fileName: `${base}.jpg` };
  } catch {
    return original;
  }
}
