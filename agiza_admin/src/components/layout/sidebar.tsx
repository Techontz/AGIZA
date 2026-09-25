"use client";

import { ChevronDown, ChevronRight, Package } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { can, useMe } from "@/hooks/use-me";
import { cn } from "@/lib/cn";
import { isGroup, navigation, type NavGroup, type NavItem, type NavLink } from "@/lib/nav";

const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/** Sidebar reproduced from Layout.tsx: bg-gray-900, w-72, blue-600 active item. */
export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { data: me, isLoading } = useMe();

  const items = useMemo<NavItem[]>(() => {
    if (!me) return [];
    return navigation
      .map((item) => (isGroup(item) ? { ...item, children: item.children.filter((c) => can(me, c.module)) } : item))
      .filter((item) => (isGroup(item) ? item.children.length > 0 : can(me, item.module)));
  }, [me]);

  // Orders starts expanded as in the design; a group also opens when it contains the active page.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ orders: true });
  useEffect(() => {
    const group = navigation.find((i) => isGroup(i) && i.children.some((c) => isActive(pathname, c.href)));
    if (group) setExpanded((prev) => (prev[group.id] ? prev : { ...prev, [group.id]: true }));
  }, [pathname]);

  return (
    <div className="flex h-full w-72 flex-col bg-gray-900 text-white">
      <div className="p-6 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg">
            <Package className="size-6" />
          </div>
          <div>
            <p className="font-bold text-xl">Agiza Platform</p>
            <p className="text-xs text-gray-400">Admin Dashboard</p>
          </div>
        </div>
      </div>

      <nav className="sidebar-scroll flex-1 overflow-y-auto p-4" aria-label="Main navigation">
        {isLoading ? (
          <div className="space-y-2" aria-hidden>
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-11 rounded-lg bg-gray-800/60 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            {items.map((item) =>
              isGroup(item) ? (
                <SidebarGroup
                  key={item.id}
                  group={item}
                  pathname={pathname}
                  expanded={Boolean(expanded[item.id])}
                  onToggle={() => setExpanded((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
                  onNavigate={onNavigate}
                />
              ) : (
                <SidebarLink key={item.id} link={item} active={isActive(pathname, item.href)} onNavigate={onNavigate} />
              ),
            )}
          </div>
        )}
      </nav>
    </div>
  );
}

function SidebarLink({ link, active, onNavigate }: { link: NavLink; active: boolean; onNavigate?: () => void }) {
  const Icon = link.icon;
  return (
    <Link
      href={link.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors",
        active ? "bg-blue-600 text-white" : "text-gray-300 hover:text-white hover:bg-gray-800",
      )}
    >
      <Icon className="size-5 flex-shrink-0" />
      <span className="text-sm font-medium">{link.label}</span>
    </Link>
  );
}

function SidebarGroup({
  group,
  pathname,
  expanded,
  onToggle,
  onNavigate,
}: {
  group: NavGroup;
  pathname: string;
  expanded: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}) {
  const Icon = group.icon;
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-800 transition-colors text-gray-300 hover:text-white"
      >
        <Icon className="size-5 flex-shrink-0" />
        <span className="flex-1 text-left text-sm font-medium">{group.label}</span>
        {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
      </button>
      {expanded && (
        <div className="ml-4 mt-1 space-y-1">
          {group.children.map((child) => {
            const ChildIcon = child.icon;
            const active = isActive(pathname, child.href);
            return (
              <Link
                key={child.id}
                href={child.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-sm",
                  active ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white hover:bg-gray-800",
                )}
              >
                <ChildIcon className="size-4 flex-shrink-0" />
                <span className="text-left">{child.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
