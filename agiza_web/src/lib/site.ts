/** Public site settings (safe for the browser). */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3200").replace(/\/+$/, "");
export const SITE_NAME = "AGIZA";
export const SITE_TAGLINE = "Shop Tanzania's stores, delivered by AGIZA";
export const SITE_DESCRIPTION =
  "Shop phones, electronics, fashion and home goods from AGIZA and trusted Tanzanian stores. Delivery across Tanzania, plus Buy for me and Deliver for me from abroad.";

export const SUPPORT_PHONE = process.env.NEXT_PUBLIC_SUPPORT_PHONE || "";
export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@agiza.co.tz";
export const ANDROID_APP_URL = process.env.NEXT_PUBLIC_ANDROID_APP_URL || "";
export const IOS_APP_URL = process.env.NEXT_PUBLIC_IOS_APP_URL || "";

export const absolute = (path: string) => `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
