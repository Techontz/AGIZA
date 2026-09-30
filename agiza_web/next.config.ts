import path from "node:path";

import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Content Security Policy. Browsers only talk to this Next.js server: Django is reached
 * server-side (pages, /api/proxy) and product images are served from /img/* (optimised by
 * next/image), so nothing else needs to be allowed.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname),
  images: {
    // Product and store images come from Django through our own /img routes.
    localPatterns: [{ pathname: "/img/**" }, { pathname: "/mark.png" }, { pathname: "/logo-agiza-black.png" }, { pathname: "/icon.png" }],
    formats: ["image/avif", "image/webp"],
    deviceSizes: [360, 480, 640, 768, 1024, 1280, 1600],
    imageSizes: [48, 64, 96, 128, 160, 200, 256, 320],
    minimumCacheTTL: 3600,
  },
  // The seller area moved to the AGIZA Seller app: old links land on the page recommending it.
  async redirects() {
    return [
      { source: "/seller", destination: "/sell", permanent: false },
      { source: "/seller/:path*", destination: "/sell", permanent: false },
      { source: "/sell/apply", destination: "/sell", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
        ],
      },
    ];
  },
};

export default nextConfig;
