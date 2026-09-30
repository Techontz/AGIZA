"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ChartColumnBig,
  Bell,
  ChevronDown,
  ChevronRight,
  Heart,
  Home,
  LayoutGrid,
  LogOut,
  Menu,
  Package,
  Search,
  ShoppingBag,
  User,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import { useCart } from "@/hooks/use-cart";
import { useCompare } from "@/hooks/use-compare";
import { useSession } from "@/hooks/use-session";
import { useWishlist } from "@/hooks/use-wishlist";
import { notificationApi, sessionApi } from "@/lib/api/endpoints";
import type { Category } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { categoryHref, money, productHref } from "@/lib/format";

import { ProductImage } from "../product/product-image";
import { Logo } from "./logo";

/**
 * The header of agizastore.com, for the AGIZA marketplace: a yellow band with the logo, a
 * category-scoped search and the account / saved / cart counters, and a second yellow bar with
 * "Shop by department" and the main sections. Phones get a compact band with the search below
 * it and a bottom navigation bar.
 */
const NAV = [
  { href: "/shop", label: "Shop" },
  { href: "/stores", label: "Stores" },
  { href: "/shop?deals=1", label: "Ofa kali" },
  { href: "/buy-for-me", label: "Buy for me" },
  { href: "/deliver-for-me", label: "Deliver for me" },
];

function useOutside<T extends HTMLElement>(open: boolean, close: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && close();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", esc);
    };
  }, [open, close]);
  return ref;
}

/** True once the page has scrolled past the full header (with a little hysteresis). */
function useScrolled(on = 200, off = 120) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    let frame = 0;
    const check = () => {
      frame = 0;
      const y = window.scrollY;
      setScrolled((was) => (was ? y > off : y > on));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    check();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [on, off]);
  return scrolled;
}

function SearchBox({ categories, compact, inputId }: { categories: Category[]; compact?: boolean; inputId?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();
  const onListing = pathname === "/shop" || pathname.startsWith("/category/");
  const [q, setQ] = useState(onListing ? (params.get("q") ?? "") : "");
  const [scope, setScope] = useState(pathname.startsWith("/category/") ? pathname.split("/")[2] : "");
  useEffect(() => {
    if (onListing) setQ(params.get("q") ?? "");
  }, [onListing, params]);
  return (
    <form
      role="search"
      className={cn("flex w-full", compact ? "h-10" : "h-[42px]")}
      onSubmit={(e) => {
        e.preventDefault();
        const term = q.trim();
        const base = scope ? `/category/${scope}` : "/shop";
        router.push(term ? `${base}?q=${encodeURIComponent(term)}` : base);
      }}
    >
      {!compact ? (
        <label className="relative shrink-0">
          <span className="sr-only">Search in</span>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            className="h-full w-[67px] cursor-pointer appearance-none truncate rounded-l-[4px] border-r border-line bg-surface pr-6 pl-[18px] text-[14px] text-ink focus:outline-none"
          >
            <option value="">All</option>
            {categories.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-ink" aria-hidden />
        </label>
      ) : null}
      <input
        id={inputId}
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={compact ? "Search something..." : "I'm shopping for..."}
        aria-label="Search products"
        enterKeyHint="search"
        className={cn(
          "h-full min-w-0 flex-1 bg-surface px-5 text-ink placeholder:text-muted focus:outline-none",
          compact ? "text-[16px]" : "text-[14px]",
          compact ? "rounded-none" : "rounded-none",
        )}
      />
      <button
        type="submit"
        aria-label="Search"
        className={cn(
          "flex h-full shrink-0 items-center justify-center bg-ink text-[14px] font-bold text-white hover:bg-[#333]",
          compact ? "w-[37px]" : "w-[96px] rounded-r-[4px]",
        )}
      >
        {compact ? <Search className="size-4" aria-hidden /> : "Search"}
      </button>
    </form>
  );
}

function Counter({ value }: { value: number }) {
  return (
    <span className="absolute top-[20px] left-[16px] flex size-5 items-center justify-center rounded-full bg-ink text-[12px] leading-none font-medium text-white tabular-nums">
      {value > 99 ? "99" : value}
    </span>
  );
}

function IconLink({ href, label, count, icon: Icon, className, thin }: { href: string; label: string; count?: number; icon: typeof Heart; className?: string; thin?: boolean }) {
  return (
    <Link href={href} prefetch={false} aria-label={label} className={cn("relative flex h-[42px] w-[30px] shrink-0 items-center justify-center text-ink hover:opacity-75", className)}>
      <Icon className={cn("size-[30px]", thin ? "stroke-[1.1]" : "stroke-[1.5]")} aria-hidden />
      {count !== undefined ? <Counter value={count} /> : null}
    </Link>
  );
}

function SavedLink({ className }: { className?: string }) {
  const { signedIn } = useSession();
  const { count } = useWishlist();
  return <IconLink href={signedIn ? "/account/saved" : "/login?next=/account/saved"} label={`Saved products, ${count}`} count={count} icon={Heart} className={className} />;
}

function CompareLink({ className }: { className?: string }) {
  const { count } = useCompare();
  return <IconLink href="/compare" label={`Compare, ${count} product${count === 1 ? "" : "s"}`} count={count} icon={ChartColumnBig} className={className} />;
}

function CartLink({ className, thin }: { className?: string; thin?: boolean }) {
  const { count } = useCart();
  return <IconLink href="/cart" label={`Cart, ${count} item${count === 1 ? "" : "s"}`} count={count} icon={ShoppingBag} className={className} thin={thin} />;
}

/** Desktop: the cart icon opens a mini cart on hover or focus (items, subtotal, View cart / Checkout). */
function MiniCart() {
  const cart = useCart();
  const [open, setOpen] = useState(false);
  const items = cart.data?.items ?? [];
  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOpen(false)}
    >
      <CartLink />
      {open ? (
        <div className="absolute top-full right-0 z-50 w-[340px] pt-3">
          <div className="border border-line bg-surface shadow-raised">
            {items.length ? (
              <>
                <ul className="max-h-[320px] divide-y divide-line overflow-y-auto">
                  {items.slice(0, 6).map((line) => (
                    <li key={line.variant_id} className="flex gap-3 p-4">
                      <Link href={productHref({ id: line.product_id, name: line.name })} className="relative size-14 shrink-0 border border-line" aria-label={line.name}>
                        <ProductImage src={line.image} alt="" sizes="56px" className="object-contain" iconClass="size-5" />
                      </Link>
                      <span className="min-w-0 flex-1 text-[14px]">
                        <Link href={productHref({ id: line.product_id, name: line.name })} className="line-clamp-2 text-link hover:underline">
                          {line.name}
                        </Link>
                        <span className="text-[13px] text-muted">
                          {line.quantity} × {money(line.unit_price)} · {line.vendor.name}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
                {items.length > 6 ? <p className="px-4 pb-2 text-[13px] text-muted">and {items.length - 6} more</p> : null}
                <div className="border-t border-line bg-canvas p-4">
                  <p className="flex justify-between text-[15px] text-ink">
                    <span>Subtotal:</span> <strong className="font-semibold tabular-nums">{money(cart.data?.subtotal ?? "0")}</strong>
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Link href="/cart" className="flex h-10 items-center justify-center rounded-sm bg-ink text-[14px] font-semibold text-white hover:bg-[#333]">
                      View cart
                    </Link>
                    <Link
                      href={cart.signedIn ? "/checkout" : "/login?next=/checkout"}
                      className="flex h-10 items-center justify-center rounded-sm bg-yellow text-[14px] font-semibold text-ink hover:bg-yellow-pressed"
                    >
                      Checkout
                    </Link>
                  </div>
                </div>
              </>
            ) : (
              <p className="p-5 text-center text-[14px] text-muted">Your cart is empty.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function useUnread() {
  const { signedIn } = useSession();
  const inbox = useQuery({
    queryKey: ["notifications"],
    queryFn: () => notificationApi.list(),
    enabled: signedIn,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  return signedIn ? (inbox.data?.unread ?? 0) : 0;
}

function AccountBlock() {
  const { customer, ready } = useSession();
  const unread = useUnread();
  const [open, setOpen] = useState(false);
  const ref = useOutside<HTMLDivElement>(open, () => setOpen(false));
  if (!ready) return <span className="h-9 w-[97px]" aria-hidden />;
  if (!customer) {
    return (
      <div className="flex h-9 items-center gap-3">
        <User className="size-[30px] stroke-[1.5] text-ink" aria-hidden />
        <span className="flex flex-col text-[14px] leading-[18px] font-semibold text-ink">
          <Link href="/login" className="hover:underline">
            Login
          </Link>
          <Link href="/register" className="hover:underline">
            Register
          </Link>
        </span>
      </div>
    );
  }
  const first = customer.full_name.split(" ")[0];
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Account menu for ${first}${unread ? `, ${unread} unread notifications` : ""}`}
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 items-center gap-3 text-left text-ink"
      >
        <span className="relative">
          <User className="size-[30px] stroke-[1.5]" aria-hidden />
          {unread ? <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2 border-yellow bg-sale" aria-hidden /> : null}
        </span>
        <span className="flex flex-col text-[14px] leading-[18px]">
          <span className="max-w-32 truncate">Hi, {first}</span>
          <span className="flex items-center gap-0.5 font-semibold">
            My account <ChevronDown className="size-3.5" aria-hidden />
          </span>
        </span>
      </button>
      {open ? (
        <div role="menu" className="absolute top-full right-0 z-50 mt-2 w-56 border border-line bg-surface py-1.5 shadow-raised" onClick={() => setOpen(false)}>
          <MenuLink href="/account" icon={User} label="My account" />
          <MenuLink href="/account/orders" icon={Package} label="My orders" />
          <MenuLink href="/account/saved" icon={Heart} label="Saved products" />
          <MenuLink href="/account/notifications" icon={Bell} label={unread ? `Notifications (${unread})` : "Notifications"} />
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              await sessionApi.logout().catch(() => undefined);
              window.location.assign("/");
            }}
            className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-[14px] text-danger hover:bg-canvas"
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
    <Link href={href} role="menuitem" prefetch={false} className="flex items-center gap-2.5 px-4 py-2 text-[14px] text-ink hover:bg-canvas">
      <Icon className="size-4 text-muted" aria-hidden /> {label}
    </Link>
  );
}

/** Right-hand actions, as on agizastore.com: compare, wishlist, cart (30px icons 40px apart) and the account. */
function DesktopActions() {
  return (
    <div className="flex items-center justify-end gap-10 pr-5">
      <CompareLink />
      <SavedLink />
      <MiniCart />
      <AccountBlock />
    </div>
  );
}

/** "Shop by Department": the category list drops down under the bar; subcategories fly out to the right. */
function DepartmentMenu({ categories }: { categories: Category[] }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const ref = useOutside<HTMLDivElement>(open, () => setOpen(false));
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  const current = categories.find((c) => c.id === active);
  return (
    <div ref={ref} className="relative h-full w-[260px] max-w-full shrink-0" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        className="flex h-full w-full items-center gap-[10px] text-[16px] font-semibold text-ink"
      >
        <Menu className="size-5 stroke-[1.8]" aria-hidden /> Shop by Department
      </button>
      {open ? (
        <div className="absolute top-full left-0 z-50 flex border border-line bg-surface shadow-raised">
          <ul className="w-[260px] py-2">
            {categories.map((c) => (
              <li key={c.id} onMouseEnter={() => setActive(c.id)}>
                <Link
                  href={categoryHref(c)}
                  className={cn("flex items-center justify-between px-5 py-2.5 text-[14px] text-ink hover:text-primary", active === c.id && "text-primary")}
                >
                  {c.name}
                  {c.children.length ? <ChevronRight className="size-4 text-subtle" aria-hidden /> : null}
                </Link>
              </li>
            ))}
            <li className="mt-1 border-t border-line pt-1">
              <Link href="/shop" className="block px-5 py-2.5 text-[14px] font-semibold text-ink hover:text-primary">
                All products
              </Link>
            </li>
          </ul>
          {current?.children.length ? (
            <ul className="w-[240px] border-l border-line py-2">
              {current.children.map((s) => (
                <li key={s.id}>
                  <Link href={categoryHref(s)} className="block px-5 py-2.5 text-[14px] text-ink hover:text-primary">
                    {s.name}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function MobileMenu({ categories, onClose }: { categories: Category[]; onClose: () => void }) {
  const { customer } = useSession();
  const [openCat, setOpenCat] = useState<number | null>(null);
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
    <div className="fixed inset-0 z-[60] min-[1200px]:hidden" role="dialog" aria-modal="true" aria-label="Menu">
      <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/50" onClick={onClose} />
      <nav className="absolute inset-y-0 left-0 flex w-[min(340px,88vw)] flex-col overflow-y-auto bg-surface" onClick={(e) => (e.target as HTMLElement).closest("a") && onClose()}>
        <div className="flex items-center justify-between bg-yellow px-4 py-3">
          <Logo width={105} />
          <button type="button" onClick={onClose} aria-label="Close menu" className="flex size-10 items-center justify-center text-ink">
            <X className="size-6" />
          </button>
        </div>
        <p className="border-b border-line px-5 pt-4 pb-2 text-[13px] font-semibold tracking-wide text-muted uppercase">Shop by Department</p>
        <ul>
          {categories.map((c) => (
            <li key={c.id} className="border-b border-line">
              <div className="flex items-center">
                <Link href={categoryHref(c)} className="flex-1 px-5 py-3 text-[15px] text-ink">
                  {c.name}
                </Link>
                {c.children.length ? (
                  <button
                    type="button"
                    aria-expanded={openCat === c.id}
                    aria-label={`${c.name} subcategories`}
                    onClick={() => setOpenCat(openCat === c.id ? null : c.id)}
                    className="flex size-12 items-center justify-center text-muted"
                  >
                    <ChevronDown className={cn("size-4 transition-transform", openCat === c.id && "rotate-180")} />
                  </button>
                ) : null}
              </div>
              {openCat === c.id ? (
                <ul className="bg-canvas py-1">
                  {c.children.map((s) => (
                    <li key={s.id}>
                      <Link href={categoryHref(s)} className="block px-8 py-2.5 text-[14px] text-ink">
                        {s.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="border-b border-line px-5 pt-5 pb-2 text-[13px] font-semibold tracking-wide text-muted uppercase">AGIZA</p>
        <ul>
          {[...NAV, { href: "/sell", label: "Sell on AGIZA" }, { href: "/account/orders", label: "Track your order" }].map((n) => (
            <li key={n.href} className="border-b border-line">
              <Link href={n.href} prefetch={n.href.startsWith("/account") ? false : undefined} className="block px-5 py-3 text-[15px] text-ink">
                {n.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-auto p-4">
          {customer ? (
            <Link href="/account" prefetch={false} className="flex h-11 items-center justify-center rounded-sm bg-ink text-[15px] font-semibold text-white">
              My account
            </Link>
          ) : (
            <Link href="/login" className="flex h-11 items-center justify-center rounded-sm bg-ink text-[15px] font-semibold text-white">
              Login / Register
            </Link>
          )}
        </div>
      </nav>
    </div>
  );
}

/** The phone navigation bar at the bottom of the screen (as on agizastore.com and the AGIZA app). */
function BottomNav({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  const { count } = useCart();
  const { signedIn } = useSession();
  const item = "flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium";
  return (
    <nav aria-label="Quick navigation" className="fixed inset-x-0 bottom-0 z-40 flex h-[60px] border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] min-[1200px]:hidden">
      <Link href="/" className={cn(item, pathname === "/" ? "text-ink" : "text-muted")}>
        <Home className="size-[22px]" aria-hidden /> Home
      </Link>
      <button type="button" onClick={onMenu} className={cn(item, "text-muted")}>
        <LayoutGrid className="size-[22px]" aria-hidden /> Categories
      </button>
      <button
        type="button"
        onClick={() => {
          const input = document.getElementById("mobile-search") as HTMLInputElement | null;
          window.scrollTo({ top: 0, behavior: "smooth" });
          input?.focus();
        }}
        className={cn(item, "text-muted")}
      >
        <Search className="size-[22px]" aria-hidden /> Search
      </button>
      <Link href="/cart" className={cn(item, pathname === "/cart" ? "text-ink" : "text-muted")}>
        <span className="relative">
          <ShoppingBag className="size-[22px]" aria-hidden />
          {count ? <Counter value={count} /> : null}
        </span>
        Cart
      </Link>
      <Link href={signedIn ? "/account" : "/login"} prefetch={false} className={cn(item, pathname.startsWith("/account") ? "text-ink" : "text-muted")}>
        <User className="size-[22px]" aria-hidden /> Account
      </Link>
    </nav>
  );
}

/** The header frame of agizastore.com: up to 1680px wide with 30px side padding (1620px of content). */
function Frame({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-[1680px] px-[30px]", className)}>{children}</div>;
}

/** Top row on desktop: logo (300px column), search (fills), actions (370px column). */
const TOP_GRID = "grid grid-cols-[300px_minmax(0,1fr)_370px] items-center";

export function Header({ categories }: { categories: Category[] }) {
  const [menu, setMenu] = useState(false);
  const pathname = usePathname();
  useEffect(() => setMenu(false), [pathname]);
  const minimal = pathname.startsWith("/checkout");
  const scrolled = useScrolled();

  if (minimal) {
    return (
      <header className="bg-yellow">
        <Frame className="flex h-[70px] items-center justify-between">
          <Logo width={140} />
          <p className="flex items-center gap-2 text-[14px] font-medium text-ink">
            <span className="size-2 rounded-full bg-success" aria-hidden /> Secure checkout
          </p>
        </Frame>
      </header>
    );
  }

  const phoneRow = (
    <Frame className="flex h-[62px] items-center">
      <Logo width={105} />
      <div className="ml-auto flex items-center gap-5">
        <CartLink thin />
        <Link href="/account" prefetch={false} aria-label="My account" className="flex h-[42px] items-center text-ink">
          <User className="size-[28px] stroke-[1.1]" aria-hidden />
        </Link>
      </div>
    </Frame>
  );

  return (
    <>
      <header className="bg-yellow">
        {/* Desktop (1200px and wider, as on agizastore.com) */}
        <div className="hidden border-b border-black/15 min-[1200px]:block">
          <Frame className={cn(TOP_GRID, "py-[25px]")}>
            <div className="flex h-20 items-center pl-0.5">
              <Logo width={210} />
            </div>
            <Suspense fallback={<div className="h-[42px] bg-surface" />}>
              <SearchBox categories={categories} />
            </Suspense>
            <DesktopActions />
          </Frame>
        </div>
        <nav aria-label="Main" className="hidden min-[1200px]:block">
          <Frame className="flex h-[50px] items-center">
            <DepartmentMenu categories={categories} />
            <ul className="ml-[35px] flex h-full items-center">
              {NAV.map((n) => (
                <li key={n.href} className="mr-[5px] h-full [&:first-child>a]:pl-0">
                  <Link href={n.href} className="flex h-full items-center px-[15px] text-[16px] text-ink hover:underline">
                    {n.label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="ml-auto flex items-center text-[14px] text-ink">
              <Link href="/sell" className="hover:underline">
                Sell on AGIZA
              </Link>
              <span className="mx-3 h-4 w-0.5 bg-ink" aria-hidden />
              <Link href="/account/orders" prefetch={false} className="hover:underline">
                Track your order
              </Link>
            </div>
          </Frame>
        </nav>

        {/* Tablets and phones: a grey strip on tablets, then logo + cart + account, then the search */}
        <div className="min-[1200px]:hidden">
          <div className="hidden bg-[#f3f4f3] md:block">
            <Frame className="flex h-[53px] items-center justify-between text-[14px]">
              <p className="text-muted">Welcome to AGIZA — Tanzania&apos;s online marketplace</p>
              <div className="flex items-center text-ink">
                <Link href="/sell" className="hover:underline">
                  Sell on AGIZA
                </Link>
                <span className="mx-3 h-4 w-0.5 bg-ink" aria-hidden />
                <Link href="/account/orders" prefetch={false} className="hover:underline">
                  Track your order
                </Link>
              </div>
            </Frame>
          </div>
          {phoneRow}
          <div className="px-5 py-2.5">
            <Suspense fallback={<div className="h-10 bg-surface" />}>
              <SearchBox categories={categories} compact inputId="mobile-search" />
            </Suspense>
          </div>
        </div>
      </header>

      {/* After scrolling, a thin bar stays at the top (as on agizastore.com). */}
      <div
        className={cn(
          "fixed inset-x-0 top-0 z-50 bg-yellow shadow-[0_2px_10px_rgb(0_0_0/0.15)] transition-transform duration-200",
          scrolled ? "translate-y-0" : "pointer-events-none -translate-y-full",
        )}
        inert={!scrolled}
        aria-hidden={!scrolled}
      >
        <Frame className={cn(TOP_GRID, "hidden h-[62px] min-[1200px]:grid")}>
          <div className="h-full w-[260px]">
            <DepartmentMenu categories={categories} />
          </div>
          <Suspense fallback={<div className="h-[42px] bg-surface" />}>
            <SearchBox categories={categories} />
          </Suspense>
          <DesktopActions />
        </Frame>
        <div className="min-[1200px]:hidden">{phoneRow}</div>
      </div>
      <BottomNav onMenu={() => setMenu(true)} />
      {menu ? <MobileMenu categories={categories} onClose={() => setMenu(false)} /> : null}
    </>
  );
}
