"use client";

import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

import { cn } from "@/lib/utils";
import type { AppRole } from "@/types";

import RealtimeIndicator from "./RealtimeIndicator";
import SidebarNav from "./SidebarNav";

// ---------------------------------------------------------------------------
// Public contracts — strict, no `any`
// ---------------------------------------------------------------------------
export interface SidebarProps {
  /** Authenticated user role (RBAC). */
  role: AppRole;
  /** Number of carrier batches not yet handed over (manifest badge). */
  pendingBatchCount: number;
}

// ---------------------------------------------------------------------------
// Airship Express sidebar
// ---------------------------------------------------------------------------
// Design decisions:
// - Navigation links (Dashboard, Parcels, Track) use a soft accent: left border
//   + muted bg, not a solid pink fill, so the active state is discoverable
//   but not visually competing with the CTA.
// - Create Parcel is a `variant: "cta"` and renders as a full-width primary
//   button (gradient, shadow, + icon). It lives in SidebarNav, not as a nav row.
// - Dual highlight is fixed via longest-match active detection (usePathname +
//   sorted href length) so only one of /parcels and /parcels/new is ever active.
// - Admin modules use a controlled accordion (useState<Record<id,boolean>>)
//   with Tailwind grid-rows animation — no Radix/shadcn dependency required,
//   but the markup is forwards-compatible (aria-expanded, aria-controls).
// ---------------------------------------------------------------------------
export default function Sidebar({
  role,
  pendingBatchCount,
}: SidebarProps): React.JSX.Element {
  const [mobileOpen, setMobileOpen] = useState<boolean>(false);
  const pathname = usePathname();

  const openMobile = useCallback((): void => setMobileOpen(true), []);
  const closeMobile = useCallback((): void => setMobileOpen(false), []);

  // Auto-close drawer on navigation — ensures content is visible after tap
  useEffect((): void => {
    setMobileOpen(false);
  }, [pathname]);

  // ESC closes mobile drawer (a11y)
  useEffect((): (() => void) | void => {
    if (!mobileOpen) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return (): void => document.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  return (
    <>
      {/* Mobile hamburger — hidden on lg+ where sidebar is persistent */}
      <button
        type="button"
        onClick={openMobile}
        aria-label="Open navigation"
        aria-expanded={mobileOpen}
        aria-controls="mobile-sidebar"
        className="lg:hidden fixed z-30 touch-target p-2.5 rounded-xl bg-slate-900 text-white shadow-lg ring-1 ring-slate-800 hover:bg-slate-800 transition-colors left-[max(1rem,env(safe-area-inset-left))] top-[max(1rem,env(safe-area-inset-top))]"
      >
        <Menu className="w-5 h-5" aria-hidden />
      </button>

      {/* Desktop — persistent, sticky full-height */}
      <aside
        aria-label="Primary navigation"
        className="hidden lg:flex w-72 bg-slate-900 text-slate-300 flex-col shrink-0 shadow-2xl z-20 app-shell sticky top-0 border-r border-slate-800"
      >
        <Brand />
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <SidebarNav
            role={role}
            pendingBatchCount={pendingBatchCount}
          />
        </div>
        <RealtimeIndicator />
      </aside>

      {/* Mobile drawer — overlay + slide-in panel */}
      <div
        className={cn(
          "fixed inset-0 z-40 lg:hidden transition-opacity duration-200",
          mobileOpen ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
        aria-hidden={!mobileOpen}
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-slate-950/70 backdrop-blur-[2px]"
          onClick={closeMobile}
          aria-hidden
        />

        {/* Panel */}
        <aside
          id="mobile-sidebar"
          aria-label="Mobile navigation"
          className={cn(
            "absolute left-0 top-0 h-full w-72 bg-slate-900 text-slate-300 flex flex-col shadow-2xl overflow-hidden border-r border-slate-800 transition-transform duration-200 ease-out",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="flex items-center justify-between pr-3 shrink-0">
            <Brand />
            <button
              type="button"
              onClick={closeMobile}
              aria-label="Close navigation"
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 transition-colors"
            >
              <X className="w-5 h-5" aria-hidden />
            </button>
          </div>

          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <SidebarNav
              role={role}
              pendingBatchCount={pendingBatchCount}
            />
          </div>

          <RealtimeIndicator />
        </aside>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Sub-components — typed, single-responsibility
// ---------------------------------------------------------------------------

function Brand(): React.JSX.Element {
  return (
    <div className="px-3 py-3 border-b border-slate-800 flex items-center gap-2.5 shrink-0 overflow-hidden">
      {/* Pink AX — exact user artwork, compact to avoid header overlap */}
      <div className="w-9 h-8 rounded-lg overflow-hidden shadow-sm ring-1 ring-pink-500/20 flex items-center justify-center shrink-0 bg-[#E81B75]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icons/airship-pink-mark.png"
          alt="Airship Express"
          width={36}
          height={22}
          className="w-full h-full object-contain"
          loading="eager"
          decoding="async"
        />
      </div>
      <div className="min-w-0 flex-1 overflow-hidden">
        <h1 className="font-black text-white text-[13px] tracking-wide leading-none truncate flex items-baseline gap-1">
          <span className="truncate">AIRSHIP</span>
          <span className="text-pink-500 shrink-0">EXPRESS</span>
        </h1>
      </div>
    </div>
  );
}
