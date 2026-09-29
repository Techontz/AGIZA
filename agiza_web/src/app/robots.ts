import type { MetadataRoute } from "next";

import { absolute } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/account", "/checkout", "/cart", "/seller", "/login", "/register", "/forgot-password", "/sell/apply"] }],
    sitemap: absolute("/sitemap.xml"),
  };
}
