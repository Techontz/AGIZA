import type { MetadataRoute } from "next";

import { absolute } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/account", "/checkout", "/cart", "/login", "/register", "/forgot-password"] }],
    sitemap: absolute("/sitemap.xml"),
  };
}
