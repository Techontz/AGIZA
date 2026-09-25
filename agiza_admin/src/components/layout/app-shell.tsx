"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { cn } from "@/lib/cn";

import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

const DESKTOP = "(min-width: 1024px)";

/**
 * Layout.tsx rebuilt: collapsible w-72 sidebar on desktop, slide-over drawer
 * below the lg breakpoint. The content column scrolls; the sidebar stays put.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP);
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => setMobileOpen(false), [pathname]);

  const toggle = () => (isDesktop ? setDesktopOpen((v) => !v) : setMobileOpen((v) => !v));

  return (
    <div className="h-dvh bg-gray-50 flex overflow-hidden">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden lg:block flex-shrink-0 overflow-hidden transition-all duration-300",
          desktopOpen ? "w-72" : "w-0",
        )}
      >
        <Sidebar />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="relative h-full shadow-xl">
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <Topbar sidebarOpen={isDesktop ? desktopOpen : mobileOpen} onToggleSidebar={toggle} />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
