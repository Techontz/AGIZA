"use client";

import { Globe, LifeBuoy, LogOut, MapPin, Package, Store, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useSession } from "@/hooks/use-session";
import { sessionApi } from "@/lib/api/endpoints";
import { cn } from "@/lib/cn";

const LINKS = [
  { href: "/account", label: "Profile", icon: User, exact: true },
  { href: "/account/orders", label: "Orders", icon: Package },
  { href: "/account/addresses", label: "Addresses", icon: MapPin },
  { href: "/account/requests", label: "Buy / Deliver for me", icon: Globe },
  { href: "/account/support", label: "Support", icon: LifeBuoy },
];

export function AccountNav() {
  const pathname = usePathname();
  const { customer, store } = useSession();
  const links = [...LINKS, store ? { href: "/seller", label: "My store", icon: Store } : { href: "/sell", label: "Sell on AGIZA", icon: Store }];
  return (
    <nav aria-label="Account" className="lg:sticky lg:top-32">
      {customer ? (
        <div className="mb-3 hidden rounded-lg bg-surface p-4 shadow-card lg:block">
          <p className="truncate font-semibold text-ink">{customer.full_name}</p>
          <p className="text-[13px] text-muted">{customer.phone}</p>
        </div>
      ) : null}
      <ul className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:rounded-lg lg:bg-surface lg:p-2 lg:shadow-card">
        {links.map(({ href, label, icon: Icon, ...rest }) => {
          const active = "exact" in rest ? pathname === href : pathname.startsWith(href);
          return (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-[14px] font-medium whitespace-nowrap",
                  active ? "bg-primary-soft text-primary" : "bg-surface text-ink hover:bg-canvas lg:bg-transparent",
                )}
              >
                <Icon className="size-4" aria-hidden /> {label}
              </Link>
            </li>
          );
        })}
        <li className="hidden lg:block">
          <button
            type="button"
            onClick={async () => {
              await sessionApi.logout().catch(() => undefined);
              window.location.assign("/");
            }}
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-[14px] font-medium text-danger hover:bg-danger-soft"
          >
            <LogOut className="size-4" aria-hidden /> Sign out
          </button>
        </li>
      </ul>
    </nav>
  );
}
