/**
 * Sidebar structure, mirroring docs/.../components/Layout.tsx (labels, icons, order),
 * with real routes and the Django permission module that guards each page.
 */
import {
  AlignJustify,
  ArrowRight,
  BarChart,
  CheckSquare,
  FileText,
  FlaskConical,
  Globe,
  Landmark,
  Layers,
  List,
  MapPin,
  MessageSquare,
  Package,
  RotateCcw,
  Settings,
  Ship,
  ShoppingCart,
  Store,
  Truck,
  Users,
  Wallet,
  Warehouse,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";

import type { ModuleKey } from "./api/types";

export interface NavLink {
  id: string;
  label: string;
  icon: LucideIcon;
  href: string;
  module: ModuleKey;
}

export interface NavGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  children: NavLink[];
}

export type NavItem = NavLink | NavGroup;

export const isGroup = (item: NavItem): item is NavGroup => "children" in item;

export const navigation: NavItem[] = [
  { id: "intake-quotes", label: "Intake & Quotes", icon: FileText, href: "/intake-quotes", module: "intake_quotes" },
  {
    id: "orders",
    label: "Orders",
    icon: Package,
    children: [
      { id: "international-orders", label: "International Orders", icon: Globe, href: "/orders/international", module: "orders" },
      { id: "express-delivery", label: "Express Delivery Management", icon: CheckSquare, href: "/orders/express", module: "orders" },
      { id: "ecommerce-orders", label: "E-commerce Shop Orders", icon: Store, href: "/orders/ecommerce", module: "orders" },
      { id: "equipment-support", label: "Equipment Support Orders", icon: Wrench, href: "/orders/equipment-support", module: "orders" },
    ],
  },
  { id: "deliveries", label: "Deliveries", icon: Truck, href: "/deliveries", module: "deliveries" },
  { id: "returns", label: "Returns", icon: RotateCcw, href: "/returns", module: "returns" },
  { id: "tasks", label: "Tasks", icon: CheckSquare, href: "/tasks", module: "tasks" },
  { id: "procurement", label: "Procurement", icon: ShoppingCart, href: "/procurement", module: "procurement" },
  { id: "shipping", label: "Shipping & Tracking", icon: Ship, href: "/shipping", module: "shipping" },
  { id: "chat", label: "Chat & Customer Support", icon: MessageSquare, href: "/chat", module: "chat" },
  { id: "ecommerce-platform", label: "E-commerce Platform", icon: Store, href: "/ecommerce", module: "ecommerce" },
  { id: "people-management", label: "People", icon: Users, href: "/people", module: "people" },
  {
    id: "finance",
    label: "Finance",
    icon: Wallet,
    children: [
      { id: "invoices", label: "Create Invoice", icon: FileText, href: "/finance/invoices", module: "finance" },
      { id: "payments", label: "Order Payments", icon: FileText, href: "/finance/payments", module: "finance" },
      { id: "wallets", label: "Wallets & Installments", icon: Wallet, href: "/finance/wallets", module: "finance" },
    ],
  },
  { id: "warehouse", label: "Warehouse & Pick Up Points", icon: Warehouse, href: "/warehouse", module: "warehouse" },
  {
    id: "shipping-engine",
    label: "Shipping Engine",
    icon: Zap,
    children: [
      { id: "shipping-engine-overview", label: "Overview", icon: BarChart, href: "/shipping-engine/overview", module: "shipping_engine" },
      { id: "shipping-engine-routes", label: "Routes", icon: ArrowRight, href: "/shipping-engine/routes", module: "shipping_engine" },
      { id: "shipping-engine-zones", label: "Shipping Zones", icon: MapPin, href: "/shipping-engine/zones", module: "shipping_engine" },
      { id: "shipping-engine-profiles", label: "Shipping Profiles", icon: Layers, href: "/shipping-engine/profiles", module: "shipping_engine" },
      { id: "shipping-engine-rules", label: "Rules", icon: AlignJustify, href: "/shipping-engine/rules", module: "shipping_engine" },
      { id: "shipping-engine-carriers", label: "Carriers", icon: Truck, href: "/shipping-engine/carriers", module: "shipping_engine" },
      { id: "shipping-engine-overrides", label: "Overrides", icon: Settings, href: "/shipping-engine/overrides", module: "shipping_engine" },
      { id: "shipping-engine-import-charges", label: "Import Charges", icon: Landmark, href: "/shipping-engine/import-charges", module: "shipping_engine" },
      { id: "shipping-engine-test-rate", label: "Test Rate", icon: FlaskConical, href: "/shipping-engine/test-rate", module: "shipping_engine" },
      { id: "shipping-engine-methods", label: "Shipping Methods", icon: List, href: "/shipping-engine/methods", module: "shipping_engine" },
      { id: "shipping-engine-settings", label: "Settings", icon: Settings, href: "/shipping-engine/settings", module: "shipping_engine" },
    ],
  },
  { id: "reporting", label: "Reporting & Audit Logs", icon: BarChart, href: "/audit-logs", module: "audit_logs" },
  { id: "settings", label: "Settings", icon: Settings, href: "/settings", module: "settings" },
];

/** Page title/subtitle for every route, taken verbatim from the Figma Make screens. */
export const pageMeta: Record<string, { title: string; description: string; icon: LucideIcon; module: ModuleKey }> = {
  "/intake-quotes": { title: "Intake & Quotes", description: "Manage quotation requests from all service types", icon: FileText, module: "intake_quotes" },
  "/orders/international": { title: "International Orders", description: "Manage product sourcing from China, USA, UK, Dubai, and India", icon: Globe, module: "orders" },
  "/orders/express": { title: "Express Delivery Management", description: "Manage and track all local deliveries", icon: CheckSquare, module: "orders" },
  "/orders/ecommerce": { title: "E-commerce Shop Orders", description: "Manage orders from your online store", icon: Store, module: "orders" },
  "/orders/equipment-support": { title: "Equipment Support Orders", description: "Installation, Setup, Maintenance, and Repairs Management", icon: Wrench, module: "orders" },
  "/deliveries": { title: "Deliveries Management", description: "Track and manage all delivery operations", icon: Truck, module: "deliveries" },
  "/returns": { title: "Returns Management", description: "Track and process product returns and refunds", icon: RotateCcw, module: "returns" },
  "/tasks": { title: "Tasks", description: "Track and manage operational tasks across all orders and deliveries", icon: CheckSquare, module: "tasks" },
  "/procurement": { title: "Procurement Management", description: "Manage supplier orders and international sourcing", icon: ShoppingCart, module: "procurement" },
  "/shipping": { title: "Shipping & Tracking", description: "Manage shipments and track cargo across all routes", icon: Ship, module: "shipping" },
  "/chat": { title: "Transaction Chat", description: "Multi-channel customer conversations with order management", icon: MessageSquare, module: "chat" },
  "/ecommerce": { title: "E-commerce Platform Management", description: "Manage your online store products, orders, shipments, and settings", icon: Store, module: "ecommerce" },
  "/people": { title: "People Management", description: "Manage all users across the platform", icon: Users, module: "people" },
  "/finance/invoices": { title: "Finance Management", description: "Track payments, invoices, and customer wallets", icon: FileText, module: "finance" },
  "/finance/payments": { title: "Finance Management", description: "Track payments, invoices, and customer wallets", icon: FileText, module: "finance" },
  "/finance/wallets": { title: "Finance Management", description: "Track payments, invoices, and customer wallets", icon: Wallet, module: "finance" },
  "/warehouse": { title: "Warehouse & Pick Up Points", description: "Manage consolidation hubs, fulfillment centers, pickup points, and shop floors", icon: Warehouse, module: "warehouse" },
  "/shipping-engine/overview": { title: "Shipping Engine", description: "Manage shipping rules, zones, routes, carriers, and pricing logic", icon: Zap, module: "shipping_engine" },
  "/shipping-engine/routes": { title: "Routes", description: "Manage directional shipping routes. Each direction is treated independently.", icon: ArrowRight, module: "shipping_engine" },
  "/shipping-engine/zones": { title: "Shipping Zones", description: "Group destinations into zones to simplify rule creation. A destination can have specific overrides without rebuilding zones.", icon: MapPin, module: "shipping_engine" },
  "/shipping-engine/profiles": { title: "Shipping Profiles", description: "Profiles determine how a product is treated by the shipping engine. Assign a profile to any product instead of creating individual rules.", icon: Layers, module: "shipping_engine" },
  "/shipping-engine/rules": { title: "Shipping Rules", description: "Rules define pricing logic. The engine selects the most specific applicable rule for each shipment.", icon: AlignJustify, module: "shipping_engine" },
  "/shipping-engine/carriers": { title: "Carriers", description: "Manage shipping carriers used across local delivery and international routes", icon: Truck, module: "shipping_engine" },
  "/shipping-engine/overrides": { title: "Overrides", description: "Create exceptions to existing rules for specific destinations, time periods, or promotions — without rebuilding zones.", icon: Settings, module: "shipping_engine" },
  "/shipping-engine/import-charges": { title: "Import Charges", description: "Customs duty, import VAT and other charges on imported products, set by staff.", icon: Landmark, module: "shipping_engine" },
  "/shipping-engine/test-rate": { title: "Test Shipping Rate", description: "Enter a shipment scenario to see which rule the engine selects — and why. Use this to debug incorrect shipping calculations without a developer.", icon: FlaskConical, module: "shipping_engine" },
  "/shipping-engine/methods": { title: "Shipping Methods", description: "Manage the available shipping methods that can be assigned to routes, zones, and rules.", icon: List, module: "shipping_engine" },
  "/shipping-engine/settings": { title: "Shipping Engine Settings", description: "Configure global defaults and engine behavior", icon: Settings, module: "shipping_engine" },
  "/audit-logs": { title: "Reporting & Audit Logs", description: "View detailed reports, analytics, and audit trails for all platform activities", icon: BarChart, module: "audit_logs" },
  "/settings": { title: "Settings", description: "Configure tag rules and system settings", icon: Settings, module: "settings" },
};

/** First page the user is allowed to see (used after login). */
export function firstAllowedHref(permissions: Record<string, string>): string {
  for (const item of navigation) {
    const links = isGroup(item) ? item.children : [item];
    for (const link of links) {
      if (permissions[link.module] && permissions[link.module] !== "none") return link.href;
    }
  }
  return "/no-access";
}
