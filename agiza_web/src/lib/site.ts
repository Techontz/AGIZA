/** Public site settings (safe for the browser). */
function siteUrl(): string {
  const value = process.env.NEXT_PUBLIC_SITE_URL;
  if (!value) {
    // Canonical links, the sitemap and Open Graph must never point at a development host.
    if (process.env.NODE_ENV === "production") throw new Error("NEXT_PUBLIC_SITE_URL must be set for production builds");
    return "http://localhost:3200";
  }
  return value.replace(/\/+$/, "");
}

export const SITE_URL = siteUrl();
export const SITE_NAME = "AGIZA";
export const SITE_TAGLINE = "Shop Tanzania's stores, delivered by AGIZA";
export const SITE_DESCRIPTION =
  "Shop phones, electronics, fashion and home goods from AGIZA and trusted Tanzanian stores. Delivery across Tanzania, plus Buy for me and Deliver for me from abroad.";

export const SUPPORT_PHONE = process.env.NEXT_PUBLIC_SUPPORT_PHONE || "";
export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@agiza.co.tz";
export const ANDROID_APP_URL = process.env.NEXT_PUBLIC_ANDROID_APP_URL || "";
export const IOS_APP_URL = process.env.NEXT_PUBLIC_IOS_APP_URL || "";
/** Sellers use their own app (AGIZA Seller); this website is for customers only. */
export const SELLER_ANDROID_APP_URL = process.env.NEXT_PUBLIC_SELLER_ANDROID_APP_URL || "";
export const SELLER_IOS_APP_URL = process.env.NEXT_PUBLIC_SELLER_IOS_APP_URL || "";

export const absolute = (path: string) => `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
