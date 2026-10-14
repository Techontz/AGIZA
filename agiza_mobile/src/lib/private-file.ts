import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { API_URL } from '@/lib/config';
import { tokenStore } from '@/lib/auth/token-store';

/** Absolute URL of a customer API path (`orders/ECO-1/invoice/`). */
export const appUrl = (path: string) => `${API_URL}/app/${path.replace(/^\/+/, '')}`;

/**
 * Download a file only the signed-in customer may see (chat documents, invoices, receipts) and hand it
 * to the phone: "Open with…" / share sheet. Throws when the download fails.
 */
export async function openPrivateFile(url: string, name: string, mimeType: string) {
  const token = await tokenStore.getAccess();
  const dir = new Directory(Paths.cache, 'documents');
  if (!dir.exists) dir.create();
  const target = new File(dir, name.replace(/[^\w.-]+/g, '_'));
  if (target.exists) target.delete(); // invoices change as payments come in: always fetch the current one
  const file = await File.downloadFileAsync(url, target, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  await Sharing.shareAsync(file.uri, {
    mimeType,
    dialogTitle: name,
    UTI: mimeType === 'application/pdf' ? 'com.adobe.pdf' : undefined,
  });
}
