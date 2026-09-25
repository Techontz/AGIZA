"use client";

import { useQueryClient } from "@tanstack/react-query";
import { KeyRound, LogOut, Menu, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useMe } from "@/hooks/use-me";
import { authService } from "@/lib/api/services/auth";

import { ChangePasswordDialog } from "./change-password-dialog";

/** Top bar from Layout.tsx: menu toggle left, signed-in user + avatar right. */
export function Topbar({ sidebarOpen, onToggleSidebar }: { sidebarOpen: boolean; onToggleSidebar: () => void }) {
  const { data: me } = useMe();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const signOut = async () => {
    setSigningOut(true);
    await authService.logout().catch(() => undefined);
    queryClient.clear();
    router.replace("/login");
  };

  return (
    <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex items-center justify-between sticky top-0 z-10">
      <button
        type="button"
        onClick={onToggleSidebar}
        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        aria-label={sidebarOpen ? "Hide navigation" : "Show navigation"}
      >
        {sidebarOpen ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="flex items-center gap-4 rounded-lg p-1 -m-1 hover:bg-gray-50 transition-colors"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <div className="text-right hidden sm:block">
            {me ? (
              <>
                <p className="text-sm font-medium text-gray-900">{me.full_name}</p>
                <p className="text-xs text-gray-500">{me.email}</p>
              </>
            ) : (
              <div className="space-y-1.5">
                <div className="h-3.5 w-24 ml-auto animate-pulse rounded bg-gray-200" />
                <div className="h-3 w-32 animate-pulse rounded bg-gray-100" />
              </div>
            )}
          </div>
          <div className="size-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold">
            {me?.initials ?? ""}
          </div>
        </button>

        {menuOpen && me && (
          <div
            role="menu"
            className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-20"
          >
            <div className="px-4 py-2 border-b border-gray-100 mb-1">
              <p className="text-sm font-medium text-gray-900 truncate">{me.full_name}</p>
              <p className="text-xs text-gray-500">
                {me.staff_level_display} · {me.employee_id}
              </p>
            </div>
            <button
              role="menuitem"
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setPasswordOpen(true);
              }}
              className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <KeyRound className="size-4 text-gray-400" /> Change password
            </button>
            <button
              role="menuitem"
              type="button"
              onClick={signOut}
              disabled={signingOut}
              className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-60"
            >
              <LogOut className="size-4" /> {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        )}
      </div>

      <ChangePasswordDialog open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </header>
  );
}
