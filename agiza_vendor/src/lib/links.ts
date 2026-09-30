import * as WebBrowser from 'expo-web-browser';
import { Alert } from 'react-native';

import { SITE_URL } from './config';

/** Opens a page of the AGIZA website in the in-app browser, or explains where to find it. */
export function openSite(path: string, fallback: { title: string; message: string }) {
  if (!SITE_URL) {
    Alert.alert(fallback.title, fallback.message);
    return;
  }
  WebBrowser.openBrowserAsync(`${SITE_URL}${path}`).catch(() => Alert.alert(fallback.title, fallback.message));
}

export function openSellerTerms() {
  openSite('/vendor-terms', {
    title: 'Seller terms',
    message: 'The AGIZA seller terms are on the AGIZA website under "Seller terms" (/vendor-terms). Contact AGIZA if you need a copy.',
  });
}

export function openPublicStore(slug: string) {
  openSite(`/store/${slug}`, {
    title: 'Your public store',
    message: `Customers find your store on the AGIZA website and app under Stores (/store/${slug}).`,
  });
}
