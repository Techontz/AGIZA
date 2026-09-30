"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  ChevronDown,
  Heart,
  Globe,
  LayoutGrid,
  LogOut,
  Menu,
  Package,
  Search,
  ShoppingBag,
  Store as StoreIcon,
  Truck,
  User,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import { useCart } from "@/hooks/use-cart";
import { useSession } from "@/hooks/use-session";
import { notificationApi, sessionApi } from "@/lib/api/endpoints";
import type { Category } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { categoryHref } from "@/lib/format";

import { Container } from "../ui/container";
import { Logo } from "./logo";

const NAV = [
  { href: "/stores", label: "Stores", icon: StoreIcon },
  { href: "/buy-for-me", label: "Buy for me", icon: Globe },
  { href: "/deliver-for-me", label: "Deliver for me", icon: Truck },
];

function SearchBox({ className, autoFocus, onDone }: { className?: string; autoFocus?: boolean; onDone?: () => void }) {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();
  const [q, setQ] = useState(pathname === "/shop" ? (params.get("q") ?? "") : "");
  useEffect(() => {
    if (pathname === "/shop") setQ(params.get("q") ?? "");
  }, [pathname, params]);
  return (
    <form
      role="search"
      className={cn("relative", className)}
      onSubmit={(e) => {
        e.preventDefault();
        const term = q.trim();
        router.push(term ? `/shop?q=${encodeURIComponent(term)}` : "/shop");
        onDone?.();
      }}
    >
      <Search className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-muted" aria-hidden />
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus={autoFocus}
        placeholder="Search products, brands and stores"
        aria-label="Search products"
        enterKeyHint="search"
        className="h-11 w-full rounded-md border border-line bg-surface pr-24 pl-10 text-[15px] text-ink placeholder:text-subtle hover:border-line-strong focus:border-brand focus:ring-3 focus:ring-primary-soft focus:outline-none"
      />
      <button
        type="submit"
        className="absolute top-1 right-1 bottom-1 rounded-sm bg-primary px-4 text-[14px] font-semibold text-white hover:bg-primary-pressed"
      >
        Search
      </button>
    </form>
  );
}

function CategoriesMenu({ categories }: { categories: Category[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 items-center gap-1.5 rounded-sm px-3 text-[14px] font-semibold text-ink hover:bg-canvas"
      >
        <LayoutGrid className="size-4 text-brand" aria-hidden />
        Categories
        <ChevronDown className={cn("size-4 text-muted transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <div className="absolute top-full left-0 z-40 mt-1 grid w-[min(640px,90vw)] grid-cols-2 gap-x-6 gap-y-4 rounded-lg border border-line bg-surface p-5 shadow-raised md:grid-cols-3">
          {categories.map((c) => (
            <div key={c.id}>
              <Link href={categoryHref(c)} className="text-[14px] font-semibold text-ink hover:text-primary">
                {c.name}
              </Link>
              {c.children.length ? (
                <ul className="mt-1.5 space-y-1">
                  {c.children.slice(0, 5).map((s) => (
                    <li key={s.id}>
                      <Link href={categoryHref(s)} className="text-[13px] text-muted hover:text-primary">
                        {s.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
          <Link href="/shop" className="col-span-full border-t border-line pt-3 text-[13px] font-semibold text-primary">
            Browse all products →
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function AccountLink() {
  const { customer, ready } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (!ready) return <span className="h-10 w-24 animate-pulse rounded-sm bg-canvas" aria-hidden />;
  if (!customer) {
    return (
      <Link href="/login" aria-label="Sign in" className="flex h-10 items-center gap-2 rounded-sm px-3 text-[14px] font-semibold text-ink hover:bg-canvas">
        <User className="size-5" aria-hidden />
        <span className="hidden lg:inline">Sign in</span>
      </Link>
    );
  }
  const first = customer.full_name.split(" ")[0];
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-label={`Account menu for ${first}`}
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 items-center gap-2 rounded-sm px-3 text-[14px] font-semibold text-ink hover:bg-canvas"
      >
        <span className="flex size-7 items-center justify-center rounded-full bg-primary-soft text-[12px] font-bold text-primary">
          {first[0]?.toUpperCase()}
        </span>
        <span className="hidden max-w-28 truncate lg:inline">{first}</span>
        <ChevronDown className="size-4 text-muted" aria-hidden />
      </button>
      {open ? (
        <div className="absolute top-full right-0 z-40 mt-1 w-56 rounded-lg border border-line bg-surface p-1.5 shadow-raised" onClick={() => setOpen(false)}>
          <MenuLink href="/account" icon={User} label="My account" />
          <MenuLink href="/account/orders" icon={Package} label="My orders" />
          <MenuLink href="/account/saved" icon={Heart} label="Saved products" />
          <button
            type="button"
            onClick={async () => {
              await sessionApi.logout().catch(() => undefined);
              window.location.assign("/");
            }}
            className="flex w-full items-center gap-2.5 rounded-sm px-3 py-2 text-left text-[14px] text-danger hover:bg-danger-soft"
          >
            <LogOut className="size-4" aria-hidden /> Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

function MenuLink({ href, icon: Icon, label }: { href: string; icon: typeof User; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 rounded-sm px-3 py-2 text-[14px] text-ink hover:bg-canvas">
      <Icon className="size-4 text-muted" aria-hidden /> {label}
    </Link>
  );
}

function NotificationBell() {
  const { signedIn } = useSession();
  const inbox = useQuery({
    queryKey: ["notifications"],
    queryFn: () => notificationApi.list(),
    enabled: signedIn,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  if (!signedIn) return null;
  const unread = inbox.data?.unread ?? 0;
  return (
    <Link
      href="/account/notifications"
      prefetch={false}
      aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
      className="relative flex h-10 items-center rounded-sm px-2.5 text-ink hover:bg-canvas"
    >
      <Bell className="size-5" aria-hidden />
      {unread ? (
        <span className="absolute top-1 right-1 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] leading-4 font-bold text-white">
          {unread > 9 ? "9+" : unread}
        </span>
      ) : null}
    </Link>
  );
}

function SavedLink() {
  const { signedIn } = useSession();
  return (
    <Link
      href={signedIn ? "/account/saved" : "/login?next=/account/saved"}
      prefetch={false}
      aria-label="Saved products"
      className="hidden h-10 items-center rounded-sm px-2.5 text-ink hover:bg-canvas sm:flex"
    >
      <Heart className="size-5" aria-hidden />
    </Link>
  );
}

function CartLink() {
  const { count } = useCart();
  return (
    <Link
      href="/cart"
      className="relative flex h-10 items-center gap-2 rounded-sm px-3 text-[14px] font-semibold text-ink hover:bg-canvas"
      aria-label={`Cart, ${count} item${count === 1 ? "" : "s"}`}
    >
      <ShoppingBag className="size-5" aria-hidden />
      <span className="hidden lg:inline">Cart</span>
      {count > 0 ? (
        <span className="absolute top-0.5 left-6 min-w-[18px] rounded-full bg-primary px-1 text-center text-[11px] leading-[18px] font-bold text-white tabular-nums">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}

function MobileMenu({ categories, onClose }: { categories: Category[]; onClose: () => void }) {
  const { customer } = useSession();
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", esc);
      document.body.style.overflow = "";
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
      <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <nav className="absolute inset-y-0 left-0 flex w-[min(320px,86vw)] flex-col overflow-y-auto bg-surface" onClick={(e) => (e.target as HTMLElement).closest("a") && onClose()}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <Logo size={26} />
          <button type="button" onClick={onClose} aria-label="Close menu" className="rounded-sm p-2 hover:bg-canvas">
            <X className="size-5" />
          </button>
        </div>
        <div className="space-y-1 p-3">
          <DrawerLink href="/shop" label="Shop all products" icon={ShoppingBag} />
          {NAV.map((n) => (
            <DrawerLink key={n.href} href={n.href} label={n.label} icon={n.icon} />
          ))}
          <DrawerLink href="/sell" label="Sell on AGIZA" icon={StoreIcon} />
        </div>
        <div className="border-t border-line p-3">
          <p className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-muted uppercase">Categories</p>
          {categories.map((c) => (
            <Link key={c.id} href={categoryHref(c)} className="block rounded-sm px-3 py-2 text-[15px] text-ink hover:bg-canvas">
              {c.name}
            </Link>
          ))}
        </div>
        <div className="mt-auto border-t border-line p-3">
          {customer ? (
            <>
              <DrawerLink href="/account" label="My account" icon={User} />
              <DrawerLink href="/account/orders" label="My orders" icon={Package} />
            </>
          ) : (
            <DrawerLink href="/login" label="Sign in or create account" icon={User} />
          )}
        </div>
      </nav>
    </div>
  );
}

function DrawerLink({ href, label, icon: Icon }: { href: string; label: string; icon: typeof User }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-sm px-3 py-2.5 text-[15px] font-medium text-ink hover:bg-canvas">
      <Icon className="size-5 text-brand" aria-hidden />
      {label}
    </Link>
  );
}

export function Header({ categories }: { categories: Category[] }) {
  const [menu, setMenu] = useState(false);
  const pathname = usePathname();
  useEffect(() => setMenu(false), [pathname]);
  const minimal = pathname.startsWith("/checkout");

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/90">
      <Container className="flex h-16 items-center gap-2 sm:gap-4">
        {!minimal ? (
          <button type="button" className="-ml-2 rounded-sm p-2 hover:bg-canvas lg:hidden" aria-label="Open menu" onClick={() => setMenu(true)}>
            <Menu className="size-6 text-ink" />
          </button>
        ) : null}
        <Logo size={28} />
        {!minimal ? (
          <>
            <Suspense fallback={<div className="hidden h-11 flex-1 md:block" />}>
              <SearchBox className="mx-2 hidden max-w-2xl flex-1 md:block lg:mx-6" />
            </Suspense>
            <div className="ml-auto flex items-center gap-0.5">
              <Link href="/sell" className="hidden h-10 items-center rounded-sm px-3 text-[14px] font-semibold text-primary hover:bg-primary-soft xl:flex">
                Sell on AGIZA
              </Link>
              <NotificationBell />
              <SavedLink />
              <AccountLink />
              <CartLink />
            </div>
          </>
        ) : (
          <p className="ml-auto flex items-center gap-2 text-[13px] text-muted">
            <span className="size-2 rounded-full bg-success" aria-hidden /> Secure checkout
          </p>
        )}
      </Container>
      {!minimal ? (
        <>
          <Container className={cn("pb-3 md:hidden", pathname === "/" && "hidden")}>
            <Suspense fallback={<div className="h-11" />}>
              <SearchBox />
            </Suspense>
          </Container>
          <div className="hidden border-t border-line lg:block">
            <Container className="flex h-11 items-center gap-1">
              <CategoriesMenu categories={categories} />
              <Link href="/shop" className={navClass(pathname === "/shop")}>
                Shop
              </Link>
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className={navClass(pathname.startsWith(n.href))}>
                  {n.label}
                </Link>
              ))}
              <Link href="/sell" className={cn(navClass(pathname.startsWith("/sell")), "xl:hidden")}>
                Sell on AGIZA
              </Link>
              <span className="ml-auto flex items-center gap-2 text-[13px] text-muted">
                <Truck className="size-4 text-brand" aria-hidden /> Delivery across Tanzania
              </span>
            </Container>
          </div>
        </>
      ) : null}
      {menu ? <MobileMenu categories={categories} onClose={() => setMenu(false)} /> : null}
    </header>
  );
}

const navClass = (active: boolean) =>
  cn("flex h-10 items-center rounded-sm px-3 text-[14px] font-medium hover:bg-canvas", active ? "text-primary" : "text-ink");
