import type { Metadata } from "next";

import { ProsePage } from "@/components/service-page";

export const metadata: Metadata = { title: "Cookie policy", alternates: { canonical: "/cookies" } };

export default function CookiesPage() {
  return (
    <ProsePage title="Cookie policy" updated="September 2026" draft>
      <p>
        The AGIZA website uses only what it needs to work. We do not use advertising or analytics cookies and we don&apos;t let third
        parties track you on this site, so there is nothing to accept or decline.
      </p>
      <h2>Cookies</h2>
      <ul>
        <li>
          <strong>Sign-in cookies</strong> (<code>agiza_web_at</code>, <code>agiza_web_rt</code>): keep you signed in. They are only set when
          you sign in, can&apos;t be read by scripts, and are removed when you sign out.
        </li>
      </ul>
      <h2>Stored in your browser</h2>
      <ul>
        <li>
          <strong>Guest cart</strong> and <strong>saved products</strong>: kept on your device so they aren&apos;t lost before you sign in. They are
          not sent to AGIZA until you sign in, and you can clear them with your browser settings.
        </li>
      </ul>
      <p>If we ever add optional cookies, we will ask for your consent first and update this page.</p>
    </ProsePage>
  );
}
