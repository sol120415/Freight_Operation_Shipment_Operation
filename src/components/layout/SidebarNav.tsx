"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Plus } from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import {
  visibleNav,
  SETTINGS_MENU_HREFS,
  NAV_GROUPS,
  GROUPED_HREFS,
  NAV_ITEMS,
} from "@/lib/nav";
import { cn } from "@/lib/utils";
import type { AppRole } from "@/types";

// ---------------------------------------------------------------------------
// Strictly typed props
// ---------------------------------------------------------------------------
interface SidebarNavProps {
  role: AppRole;
  pendingBatchCount: number;
}

// ---------------------------------------------------------------------------
// Active-state helper — longest-match wins
// Fixes dual highlight where /parcels and /parcels/new both matched /parcels/new
// Only the most specific href is considered active.
// ---------------------------------------------------------------------------
function getActiveHref(pathname: string, hrefs: string[]): string | null {
  const matches = hrefs.filter(
    (h) => pathname === h || pathname.startsWith(`${h}/`),
  );
  if (matches.length === 0) return null;
  matches.sort((a, b) => b.length - a.length);
  return matches[0];
}

// ---------------------------------------------------------------------------
// Shared nav list — rendered in desktop sidebar and mobile drawer
// Navigation routes use soft accent style; CTA uses primary button style.
// ---------------------------------------------------------------------------
export default function SidebarNav({
  role,
  pendingBatchCount,
}: SidebarNavProps) {
  const pathname = usePathname();

  // Flat items excluding settings and grouped hrefs
  const flatItems = useMemo(
    () =>
      visibleNav(role).filter(
        (item) =>
          !SETTINGS_MENU_HREFS.includes(item.href) &&
          !GROUPED_HREFS.includes(item.href),
      ),
    [role],
  );

  const navLinks = useMemo(
    () => flatItems.filter((i) => i.variant !== "cta"),
    [flatItems],
  );
  const ctaLink = useMemo(
    () => flatItems.find((i) => i.variant === "cta"),
    [flatItems],
  );

  // Resolve groups visible for this role
  const groups = useMemo(
    () =>
      NAV_GROUPS.map((group) => {
        const items = group.hrefs
          .map((href) => NAV_ITEMS.find((n) => n.href === href))
          .filter(
            (i): i is NonNullable<typeof i> =>
              !!i && (i.roles.length === 0 || i.roles.includes(role)),
          );
        return { ...group, items };
      }).filter(
        (g) => g.items.length > 0 && (g.roles.length === 0 || g.roles.includes(role)),
      ),
    [role],
  );

  // All hrefs for active determination (flat + grouped children)
  const allHrefs = useMemo(
    () => [
      ...flatItems.map((i) => i.href),
      ...groups.flatMap((g) => g.items.map((i) => i.href)),
    ],
    [flatItems, groups],
  );
  const activeHref = useMemo(
    () => getActiveHref(pathname, allHrefs),
    [pathname, allHrefs],
  );
  const isActive = (href: string): boolean => activeHref === href;

  // Accordion open state — auto-open group if it contains active child
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const g of groups) {
      init[g.id] = g.items.some((item) => isActive(item.href));
    }
    return init;
  });

  useEffect(() => {
    setOpenGroups((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const g of groups) {
        const shouldOpen = g.items.some((item) => isActive(item.href));
        if (shouldOpen && !prev[g.id]) {
          next[g.id] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  function toggleGroup(id: string): void {
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <nav className="p-3 space-y-5 overflow-y-auto scroll-thin flex-1 min-h-0">
      {/* ================= Navigation Routes (soft accent) ================= */}
      <div className="space-y-1">
        {navLinks.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={`${item.href}-${item.label}`}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-medium transition-all border-l-2",
                active
                  ? "bg-slate-800 text-white border-pink-500 shadow-sm"
                  : "border-transparent text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 hover:border-slate-700/50",
              )}
            >
              <span className="flex items-center gap-3 min-w-0">
                <Icon
                  className={cn(
                    "w-4 h-4 shrink-0 transition-colors",
                    active ? "text-pink-400" : "text-slate-500",
                  )}
                />
                <span className="truncate">{item.label}</span>
              </span>

              <span className="flex items-center gap-2 shrink-0">
                {item.badge?.kind === "ai" && (
                  <span className="bg-pink-500/15 text-pink-300 border border-pink-500/20 text-[10px] px-1.5 py-0.5 rounded font-mono font-bold">
                    AI
                  </span>
                )}
                {item.badge?.kind === "live" && (
                  <span className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/20 text-[10px] px-2 py-0.5 rounded font-mono font-bold">
                    LIVE
                  </span>
                )}
                {item.badge?.kind === "count" && pendingBatchCount > 0 && (
                  <span
                    className={cn(
                      "text-[10px] px-2 py-0.5 rounded-full font-bold",
                      active
                        ? "bg-pink-600 text-white"
                        : "bg-slate-800 text-slate-300 border border-slate-700",
                    )}
                  >
                    {pendingBatchCount}
                  </span>
                )}
                {active && (
                  <span className="hidden sm:block w-1.5 h-1.5 rounded-full bg-pink-500 shrink-0" aria-hidden />
                )}
              </span>
            </Link>
          );
        })}
      </div>

      {/* ================= CTA — Create Parcel (distinct primary button) ================= */}
      {ctaLink && (
        <div className="px-1">
          {(() => {
            const active = isActive(ctaLink.href);
            const Icon = ctaLink.icon;
            return (
              <Link
                href={ctaLink.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "w-full flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-bold tracking-wide transition-all shadow-lg",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900",
                  active
                    ? "bg-pink-600 text-white shadow-pink-600/30 ring-2 ring-pink-400/40"
                    : "bg-gradient-to-r from-pink-600 to-rose-500 text-white shadow-pink-600/20 hover:from-pink-500 hover:to-rose-500 hover:shadow-pink-500/30 hover:-translate-y-px active:translate-y-0",
                )}
              >
                <span className="p-1 rounded-md bg-white/15 border border-white/20">
                  <Icon className="w-3.5 h-3.5" />
                </span>
                <span>{ctaLink.label}</span>
                <Plus className="w-3.5 h-3.5 opacity-80" aria-hidden />
              </Link>
            );
          })()}
          <p className="mt-1.5 text-center text-[10px] text-slate-500 font-medium tracking-wide">
            Quick action
          </p>
        </div>
      )}

      {/* ================= Admin Modules — Accordion (Tailwind state) ================= */}
      {groups.length > 0 && (
        <>
          <div className="border-t border-slate-800/70" />
          <div className="space-y-3">
            <p className="px-3 text-[10px] font-bold tracking-widest text-slate-500 uppercase">
              Admin Modules
            </p>
            {groups.map((group) => {
              const isOpen = !!openGroups[group.id];
              const GroupIcon = group.icon;
              const isGroupActive = group.items.some((item) => isActive(item.href));
              const groupHasCount =
                pendingBatchCount > 0 && group.items.some((i) => i.badge?.kind === "count");

              return (
                <div
                  key={group.id}
                  className={cn(
                    "rounded-xl border transition-all",
                    isOpen
                      ? "bg-slate-800/40 border-slate-800"
                      : "bg-transparent border-transparent hover:border-slate-800/50",
                    isGroupActive && !isOpen && "border-slate-800 bg-slate-800/30",
                  )}
                >
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={`nav-group-${group.id}`}
                    onClick={() => toggleGroup(group.id)}
                    className={cn(
                      "w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500",
                      isGroupActive ? "text-white" : "text-slate-400 hover:text-white",
                    )}
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <span
                        className={cn(
                          "p-1.5 rounded-lg border transition-colors shrink-0",
                          isGroupActive
                            ? "bg-pink-600 border-pink-500 text-white shadow-sm"
                            : "bg-slate-800 border-slate-700 text-slate-400",
                        )}
                      >
                        <GroupIcon className="w-3.5 h-3.5" />
                      </span>
                      <span className="flex flex-col min-w-0">
                        <span className="font-semibold leading-none truncate">
                          {group.label}
                        </span>
                        {group.description && (
                          <span className="text-[10px] font-normal text-slate-500 leading-none mt-1 truncate">
                            {group.description}
                          </span>
                        )}
                      </span>
                    </span>

                    <span className="flex items-center gap-2 shrink-0 ml-2">
                      {groupHasCount && !isOpen && (
                        <span className="bg-pink-600 text-white text-[10px] font-bold min-w-5 text-center px-1.5 py-0.5 rounded-full">
                          {pendingBatchCount}
                        </span>
                      )}
                      <ChevronDown
                        className={cn(
                          "w-4 h-4 text-slate-500 transition-transform duration-200",
                          isOpen && "rotate-180 text-slate-300",
                        )}
                      />
                    </span>
                  </button>

                  {/* Collapsible — Tailwind grid-rows animation (no external deps) */}
                  <div
                    id={`nav-group-${group.id}`}
                    className={cn(
                      "grid transition-all duration-200 ease-in-out",
                      isOpen
                        ? "grid-rows-[1fr] opacity-100"
                        : "grid-rows-[0fr] opacity-0 pointer-events-none",
                    )}
                  >
                    <div className="overflow-hidden">
                      <div className="px-2 pb-2 pt-1 space-y-1">
                        <div className="ml-2 pl-3 border-l border-slate-700/60 space-y-1">
                          {group.items.map((item) => {
                            const active = isActive(item.href);
                            const Icon = item.icon;
                            return (
                              <Link
                                key={`${group.id}-${item.href}-${item.label}`}
                                href={item.href}
                                aria-current={active ? "page" : undefined}
                                className={cn(
                                  "flex items-center justify-between px-3 py-2 rounded-lg text-[12px] font-medium transition-all border-l-2",
                                  active
                                    ? "bg-slate-700/80 text-white border-pink-500 shadow-sm"
                                    : "border-transparent text-slate-400 hover:bg-slate-700/50 hover:text-white hover:border-slate-600/50",
                                )}
                              >
                                <span className="flex items-center gap-2.5 min-w-0">
                                  <Icon className="w-3.5 h-3.5 shrink-0" />
                                  <span className="truncate">{item.label}</span>
                                </span>
                                {item.badge?.kind === "count" && pendingBatchCount > 0 && (
                                  <span
                                    className={cn(
                                      "text-[10px] px-1.5 py-0.5 rounded-full font-bold shrink-0 border",
                                      active
                                        ? "bg-pink-600 text-white border-pink-500"
                                        : "bg-slate-700 text-slate-300 border-slate-600",
                                    )}
                                  >
                                    {pendingBatchCount}
                                  </span>
                                )}
                                {active && !item.badge && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-pink-500 shrink-0" aria-hidden />
                                )}
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </nav>
  );
}
