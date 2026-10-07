"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  DollarSign,
  ImageIcon,
  Flag,
  Package,
  Percent,
  Settings,
  Ship,
  Star,
  ShoppingCart,
  Store,
  Tag,
  ToggleLeft,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/ui/page";
import { StatCard } from "@/components/ui/stat-card";
import { catalogApi, catalogKeys } from "@/lib/api/services/catalog";
import { marketplaceApi, marketplaceKeys } from "@/lib/api/services/marketplace";
import { formatTSh } from "@/lib/format";
import { pageMeta } from "@/lib/nav";

import { OpenProblemsNotice } from "./fulfillment-issues";
import { compactAmount } from "./shared";

export type Section =
  | "products"
  | "categories"
  | "settings"
  | "vendors"
  | "marketplace"
  | "earnings"
  | "reviews"
  | "options"
  | "labels"
  | "brands"
  | "sliders";

interface MenuItem {
  title: string;
  description: string;
  icon: LucideIcon;
  /** Full class strings so Tailwind sees them. */
  border: string;
  tile: string;
  iconColor: string;
  chevron: string;
  section?: Section;
  href?: string;
}

const MENU: MenuItem[] = [
  { title: "Products Management", description: "Manage product catalog, brands, and attributes", icon: Package, section: "products",
    border: "hover:border-blue-500", tile: "bg-blue-100 group-hover:bg-blue-200", iconColor: "text-blue-600", chevron: "group-hover:text-blue-600" },
  { title: "Shop Orders", description: "View and manage e-commerce platform orders", icon: ShoppingCart, href: "/orders/ecommerce",
    border: "hover:border-green-500", tile: "bg-green-100 group-hover:bg-green-200", iconColor: "text-green-600", chevron: "group-hover:text-green-600" },
  { title: "Shipments", description: "Track international and local shipments", icon: Ship, href: "/shipping",
    border: "hover:border-cyan-500", tile: "bg-cyan-100 group-hover:bg-cyan-200", iconColor: "text-cyan-600", chevron: "group-hover:text-cyan-600" },
  { title: "Deliveries", description: "Manage local delivery operations and tracking", icon: Truck, href: "/deliveries",
    border: "hover:border-orange-500", tile: "bg-orange-100 group-hover:bg-orange-200", iconColor: "text-orange-600", chevron: "group-hover:text-orange-600" },
  { title: "Categories", description: "Organize products into categories", icon: Tag, section: "categories",
    border: "hover:border-purple-500", tile: "bg-purple-100 group-hover:bg-purple-200", iconColor: "text-purple-600", chevron: "group-hover:text-purple-600" },
  { title: "Store Settings", description: "Configure store preferences and delivery estimates", icon: Settings, section: "settings",
    border: "hover:border-gray-500", tile: "bg-gray-100 group-hover:bg-gray-200", iconColor: "text-gray-600", chevron: "group-hover:text-gray-600" },
  { title: "Vendors", description: "Vendor applications, stores and their profit settings", icon: Users, section: "vendors",
    border: "hover:border-indigo-500", tile: "bg-indigo-100 group-hover:bg-indigo-200", iconColor: "text-indigo-600", chevron: "group-hover:text-indigo-600" },
  { title: "Marketplace Settings", description: "Commission rates, product review and vendor applications", icon: Percent, section: "marketplace",
    border: "hover:border-sky-500", tile: "bg-sky-100 group-hover:bg-sky-200", iconColor: "text-sky-600", chevron: "group-hover:text-sky-600" },
  { title: "Vendor Earnings & Payouts", description: "Sales by seller, AGIZA commission and vendor payouts", icon: Wallet, section: "earnings",
    border: "hover:border-emerald-500", tile: "bg-emerald-100 group-hover:bg-emerald-200", iconColor: "text-emerald-600", chevron: "group-hover:text-emerald-600" },
  { title: "Reviews", description: "Moderate customer product reviews and sellers' flags", icon: Star, section: "reviews",
    border: "hover:border-amber-500", tile: "bg-amber-100 group-hover:bg-amber-200", iconColor: "text-amber-600", chevron: "group-hover:text-amber-600" },
  { title: "Product Options", description: "Manage global option sets: sizes, colors, bundles and more", icon: ToggleLeft, section: "options",
    border: "hover:border-teal-500", tile: "bg-teal-100 group-hover:bg-teal-200", iconColor: "text-teal-600", chevron: "group-hover:text-teal-600" },
  { title: "Product Labels", description: "Create and manage labels like New Arrival, Sale, Best Seller", icon: Tag, section: "labels",
    border: "hover:border-rose-500", tile: "bg-rose-100 group-hover:bg-rose-200", iconColor: "text-rose-600", chevron: "group-hover:text-rose-600" },
  { title: "Brands", description: "Add and manage product brands with logos and descriptions", icon: DollarSign, section: "brands",
    border: "hover:border-yellow-500", tile: "bg-yellow-100 group-hover:bg-yellow-200", iconColor: "text-yellow-600", chevron: "group-hover:text-yellow-600" },
  { title: "App Home Sliders", description: "Banners at the top of the AGIZA customer app's home screen", icon: ImageIcon, section: "sliders",
    border: "hover:border-fuchsia-500", tile: "bg-fuchsia-100 group-hover:bg-fuchsia-200", iconColor: "text-fuchsia-600", chevron: "group-hover:text-fuchsia-600" },
];

export function EcommerceMenu({ onOpen }: { onOpen: (section: Section) => void }) {
  const meta = pageMeta["/ecommerce"];
  const stats = useQuery({ queryKey: catalogKeys.productStats, queryFn: catalogApi.productStats });
  const s = stats.data;
  const failed = stats.isError && !s;
  const loading = !s && !failed;

  return (
    <>
      <PageHeader title={meta.title} description={meta.description} />

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 mb-8">
        <StatCard label="Total Products" value={s?.total ?? "—"} icon={Package} tone="blue" loading={loading} />
        <StatCard label="Active Products" value={s?.active ?? "—"} icon={Store} tone="green" loading={loading} />
        <StatCard label="Out of Stock" value={s?.out_of_stock ?? "—"} icon={Package} tone="red" loading={loading} />
        <StatCard
          label="Inventory Value"
          value={s ? <span title={formatTSh(s.inventory_value)}>{compactAmount(s.inventory_value)}</span> : "—"}
          icon={Tag}
          tone="purple"
          loading={loading}
          compactValue
        />
      </div>
      {failed && (
        <p role="alert" className="-mt-6 mb-6 text-sm text-red-600">
          Couldn&apos;t load product statistics.{" "}
          <button type="button" className="font-medium underline" onClick={() => stats.refetch()}>
            Try again
          </button>
        </p>
      )}

      <OpenProblemsNotice className="mb-6" />
      <FlaggedReviewsNotice />

      <nav aria-label="E-commerce sections" className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {MENU.map((item) => {
          const cls = `bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md ${item.border} transition-all text-left group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500`;
          const body = (
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className={`${item.tile} p-4 rounded-lg transition-colors`}>
                  <item.icon className={`size-8 ${item.iconColor}`} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-1">{item.title}</h3>
                  <p className="text-sm text-gray-600">{item.description}</p>
                </div>
              </div>
              <ChevronRight className={`size-6 flex-shrink-0 text-gray-400 ${item.chevron} transition-colors`} />
            </div>
          );
          return item.href ? (
            <Link key={item.title} href={item.href} className={cls}>
              {body}
            </Link>
          ) : (
            <button key={item.title} type="button" onClick={() => onOpen(item.section!)} className={cls}>
              {body}
            </button>
          );
        })}
      </nav>
    </>
  );
}

/** Reviews sellers flagged, waiting for AGIZA's decision. */
function FlaggedReviewsNotice() {
  const query = { status: "flagged", page_size: 1 };
  const flagged = useQuery({
    queryKey: marketplaceKeys.reviews(query),
    queryFn: ({ signal }) => marketplaceApi.reviews.list(query, signal),
    staleTime: 30_000,
    retry: false,
  });
  const count = flagged.data?.count ?? 0;
  if (!count) return null;
  return (
    <Link
      href="/ecommerce?section=reviews&status=flagged"
      className="mb-6 flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800 hover:bg-red-100"
    >
      <span className="flex items-center gap-2 font-semibold">
        <Flag className="size-4" /> {count} review{count === 1 ? "" : "s"} flagged by sellers — waiting for moderation
      </span>
      <ChevronRight className="size-4" />
    </Link>
  );
}
