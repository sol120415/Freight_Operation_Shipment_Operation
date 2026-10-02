"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FlaskConical, Settings } from "lucide-react";
import { NAV_ITEMS, SETTINGS_MENU_HREFS } from "@/lib/nav";
import { cn } from "@/lib/utils";
import type { AppRole } from "@/types";
import {
  DEMO_MODE_COOKIE,
  DEMO_MODE_MAX_AGE_SECONDS,
} from "@/lib/demoModeConstants";

const HOVER_CLOSE_DELAY_MS = 120;

/**
 * Gear-icon dropdown for the top navbar, consolidating the account/admin
 * entries (Audit Logs, Settings, Profile) that previously lived in the
 * sidebar. Items are filtered by role exactly like the sidebar nav.
 *
 * Dropdown interaction is intentionally redundant so it “just works”:
 * - Click toggles (primary for touch / keyboard)
 * - Hover opens & delayed-close on leave (desktop convenience)
 * - Outside pointerdown, Escape, focus leaving, and route change all close it
 */
export default function SettingsMenu({
  role,
  demoMode,
}: {
  role: AppRole;
  demoMode: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  // Preserve sidebar order for the grouped entries, filtered by role.
  const items = SETTINGS_MENU_HREFS.map((href) =>
    NAV_ITEMS.find((i) => i.href === href),
  ).filter((i): i is NonNullable<typeof i> => !!i && (i.roles.length === 0 || i.roles.includes(role)));

  // Close on outside pointerdown, Escape, and when focus leaves the widget.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        // Return focus to the trigger for a11y
        const btn = rootRef.current?.querySelector<HTMLButtonElement>("button[aria-haspopup]");
        btn?.focus();
      }
    }
    function onFocusIn(e: FocusEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }

    // Use capture for pointerdown so we close before inner click handlers
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [open]);

  // Close after navigating to any route.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Cleanup any pending hover-close timer on unmount.
  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  function cancelClose() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function scheduleClose() {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), HOVER_CLOSE_DELAY_MS);
  }

  function toggleDemoMode() {
    setPending(true);
    document.cookie = `${DEMO_MODE_COOKIE}=${demoMode ? "0" : "1"}; path=/; max-age=${DEMO_MODE_MAX_AGE_SECONDS}; SameSite=Lax`;
    setOpen(false);
    router.refresh();
    // The server refresh normally completes immediately. Resetting this on a
    // short timer also keeps the control usable if the network is slow.
    window.setTimeout(() => setPending(false), 700);
  }

  return (
    <div
      ref={rootRef}
      className="relative"
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
      onFocusCapture={() => {
        // Keep open while focus is inside the widget (keyboard nav)
        cancelClose();
        // Don't auto-open on every focus capture if user deliberately closed via Escape
        // — but opening on focus is still helpful for tab users.
        // We only auto-open if focus landed on the trigger.
        const active = document.activeElement;
        if (rootRef.current?.contains(active) && active?.matches("button[aria-haspopup]")) {
          setOpen(true);
        }
      }}
      onBlurCapture={(e) => {
        // Close when focus leaves the whole widget (not just moving between its children)
        const nextFocus = e.relatedTarget as Node | null;
        // relatedTarget is null when focus leaves the window — don't close then
        if (nextFocus && !rootRef.current?.contains(nextFocus)) {
          scheduleClose();
        }
      }}
    >
      <button
        type="button"
        aria-label="Open settings menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          cancelClose();
          setOpen((v) => !v);
        }}
        className={cn(
          "touch-target p-2 rounded-lg text-slate-500 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1",
          open
            ? "text-pink-600 bg-pink-50 dark:bg-pink-950/40"
            : "hover:text-pink-600 hover:bg-pink-50 dark:hover:bg-pink-950/40",
        )}
      >
        <Settings
          className={cn(
            "w-5 h-5 transition-transform duration-200",
            open && "rotate-90 text-pink-600",
          )}
        />
      </button>

      <div
        role="menu"
        aria-label="Settings"
        aria-hidden={!open}
        className={cn(
          "absolute right-0 top-full mt-2 w-56 max-w-[calc(100vw-2rem)] rounded-xl border p-1.5 z-50",
          "bg-white dark:bg-slate-900",
          "border-slate-200 dark:border-slate-700",
          "shadow-xl shadow-slate-900/10 dark:shadow-black/40",
          "transition-all duration-150 origin-top-right",
          open
            ? "opacity-100 scale-100 pointer-events-auto translate-y-0"
            : "opacity-0 scale-95 pointer-events-none -translate-y-1",
        )}
      >
        <div className="px-2 pt-1.5 pb-2">
          <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">System</p>
        </div>
        {items.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              role="menuitem"
              href={item.href}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center space-x-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500",
                active
                  ? "bg-pink-600 text-white shadow-md shadow-pink-600/30"
                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white",
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
              {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white/90" />}
            </Link>
          );
        })}

        <div className="my-1.5 border-t border-slate-100 dark:border-slate-800" />
        <button
          type="button"
          role="menuitemcheckbox"
          onClick={toggleDemoMode}
          disabled={pending}
          aria-checked={demoMode}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-xs font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 disabled:cursor-wait disabled:opacity-70",
            demoMode
              ? "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
              : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white",
          )}
        >
          <FlaskConical className="w-4 h-4 shrink-0" />
          <span className="flex-1">
            <span className="block">Demo Mode</span>
            <span className="block text-[10px] font-normal opacity-70">
              {demoMode ? "Sample data is on" : "Show sample data"}
            </span>
          </span>
          <span
            className={cn(
              "relative h-4 w-7 rounded-full transition-colors",
              demoMode ? "bg-amber-500" : "bg-slate-300 dark:bg-slate-600",
            )}
            aria-hidden="true"
          >
            <span
              className={cn(
                "absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform",
                demoMode ? "translate-x-3.5" : "translate-x-0.5",
              )}
            />
          </span>
        </button>
      </div>
    </div>
  );
}
