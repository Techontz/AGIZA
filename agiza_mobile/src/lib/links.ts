/**
 * Links to AGIZA pages: the website address of a product or store (what customers share and what
 * staff paste into home banners), and the in-app screen such a link opens.
 */
import type { Href } from 'expo-router';
import { Share } from 'react-native';

import { SITE_URL } from './config';
import { money } from './format';

/** Shareable link: the website page when the site is configured, else the app's own link. */
export const productLink = (id: number) => (SITE_URL ? `${SITE_URL}/product/${id}` : `agiza://product/${id}`);
export const storeLink = (slug: string) => (SITE_URL ? `${SITE_URL}/store/${slug}` : `agiza://store/${slug}`);

const siteHost = () => SITE_URL.replace(/^https?:\/\//, '').split('/')[0].toLowerCase();

function isAgizaHost(host: string): boolean {
  const h = host.toLowerCase();
  return (!!SITE_URL && h === siteHost()) || h.includes('agiza');
}

/**
 * The app screen for an AGIZA product / store link (website or agiza://), or null for any other link,
 * which then opens in the browser. Parsed by hand: React Native's URL support varies by version.
 */
export function appRouteFor(link: string): Href | null {
  const text = link.trim();
  let path: string;
  const app = /^agiza:\/\/(.*)$/i.exec(text);
  if (app) path = app[1];
  else {
    const web = /^https?:\/\/([^/?#]+)([^?#]*)/i.exec(text);
    if (!web || !isAgizaHost(web[1])) return null;
    path = web[2];
  }
  const [kind, value] = path.split(/[?#]/)[0].split('/').filter(Boolean);
  if (kind === 'product' && value && /^\d+$/.test(value)) return { pathname: '/product/[id]', params: { id: value } };
  if (kind === 'store' && value) return { pathname: '/store/[slug]', params: { slug: decodeURIComponent(value) } };
  return null;
}

export async function shareProduct(p: { id: number; name: string; price?: string | null }) {
  const link = productLink(p.id);
  const price = p.price ? ` — ${money(p.price)}` : '';
  await Share.share({ message: `${p.name}${price}\nOn AGIZA: ${link}`, url: link, title: p.name }).catch(() => null);
}

export async function shareStore(s: { slug: string; name: string }) {
  const link = storeLink(s.slug);
  await Share.share({ message: `${s.name} on AGIZA: ${link}`, url: link, title: s.name }).catch(() => null);
}
