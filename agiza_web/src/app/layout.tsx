import type { Metadata, Viewport } from "next";
import { Work_Sans } from "next/font/google";

import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import type { Category } from "@/lib/api/types";
import { publicGet } from "@/lib/server/django";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/site";

import "./globals.css";
import { Providers } from "./providers";

const workSans = Work_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-work-sans", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} · ${SITE_TAGLINE}`, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_TZ",
    url: SITE_URL,
    title: `${SITE_NAME} · ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    images: [{ url: "/icon.png", width: 1024, height: 1024, alt: "AGIZA" }],
  },
  twitter: { card: "summary", title: SITE_NAME, description: SITE_DESCRIPTION, images: ["/icon.png"] },
  icons: { icon: "/favicon.png", apple: "/icon.png" },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = { themeColor: "#FCB800", width: "device-width", initialScale: 1 };

async function loadCategories(): Promise<Category[]> {
  try {
    return (await publicGet<Category[]>("categories/", undefined, 300)) ?? [];
  } catch {
    return []; // the header still works without the category menu
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const categories = await loadCategories();
  return (
    <html lang="en" className={workSans.variable}>
      <body className="flex min-h-dvh flex-col">
        <a href="#main" className="sr-only z-50 rounded-sm bg-ink px-3 py-2 text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
          Skip to content
        </a>
        <Providers>
          <Header categories={categories} />
          <main id="main" className="flex-1">
            {children}
          </main>
          <Footer categories={categories} />
        </Providers>
      </body>
    </html>
  );
}
