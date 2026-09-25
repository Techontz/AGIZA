"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useMe } from "@/hooks/use-me";
import { firstAllowedHref } from "@/lib/nav";

/** Landing: the design opens on Express Delivery; users without it go to their first permitted module. */
export default function HomePage() {
  const { data: me } = useMe();
  const router = useRouter();
  useEffect(() => {
    if (!me) return;
    router.replace(me.permissions.orders !== "none" ? "/orders/express" : firstAllowedHref(me.permissions));
  }, [me, router]);
  return null;
}
