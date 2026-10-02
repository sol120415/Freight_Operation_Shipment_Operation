"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Search, Clock3, LogOut, Loader2, Bell } from "lucide-react";
import type { Profile } from "@/types";
import { signOut } from "@/app/login/actions";
import {
  formatSessionCountdown,
  useSessionTimeout,
} from "@/components/auth/SessionTimeoutProvider";
import ThemeToggle from "./ThemeToggle";
import SettingsMenu from "./SettingsMenu";

export default function Header({
  profile,
  unreadCount = 0,
  demoMode = false,
}: {
  profile: Profile;
  unreadCount?: number;
  demoMode?: boolean;
}) {
  const router = useRouter();
  const [term, setTerm] = useState("");
  const [pending, startTransition] = useTransition();
  const { secondsLeft } = useSessionTimeout();

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = term.trim();
    // Global parcel search — RLS scopes results to the caller's role.
    if (q) router.push(`/parcels?q=${encodeURIComponent(q)}`);
  }

  const initials = (profile.full_name ?? profile.email ?? "U")
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="min-h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 pl-16 lg:pl-6 pr-4 sm:pr-6 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 sm:pb-0 sm:h-16 flex flex-wrap sm:flex-nowrap items-center justify-between gap-x-3 gap-y-2 shrink-0 shadow-sm z-10 min-w-0">
      <form
        onSubmit={onSearch}
        className="relative order-1 w-full sm:order-none sm:flex-1 sm:max-w-[360px] min-w-0"
      >
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type="search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search parcels..."
          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-4 py-2.5 sm:py-2 text-xs focus:outline-none focus:ring-2 focus:ring-pink-500 focus:bg-white dark:focus:bg-slate-800 transition-all"
        />
      </form>

      <div className="order-2 ml-auto flex items-center gap-1.5 sm:gap-2 shrink-0">
        <div
          title={`Session expires in ${formatSessionCountdown(secondsLeft)} if idle`}
          aria-label={`Session expires in ${formatSessionCountdown(secondsLeft)} if idle`}
          className={`hidden sm:flex items-center space-x-2 px-3 py-1.5 rounded-full text-xs font-semibold border ${
            secondsLeft <= 30
              ? "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-300"
              : "bg-pink-50 dark:bg-pink-950/40 border-pink-200 dark:border-pink-900 text-pink-700 dark:text-pink-300"
          }`}
        >
          <Clock3 className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="tabular-nums">Session timeout · {formatSessionCountdown(secondsLeft)}</span>
        </div>

        <ThemeToggle />

        <Link
          href="/notifications"
          aria-label="Notifications"
          className="relative touch-target p-2 rounded-lg text-slate-500 hover:text-pink-600 hover:bg-pink-50 dark:hover:bg-pink-950/40 transition-all"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-pink-600 text-white text-[9px] font-black flex items-center justify-center">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Link>

        <SettingsMenu role={profile.role} demoMode={demoMode} />

        <div className="hidden sm:block h-6 w-px bg-slate-200 dark:bg-slate-700" />

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-9 h-9 sm:w-8 sm:h-8 rounded-full bg-slate-900 text-white font-bold text-xs flex items-center justify-center border-2 border-pink-500 shadow-sm shrink-0">
            {initials}
          </div>
          <div className="text-left hidden md:block min-w-0 max-w-[12rem]">
            <div className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-none truncate">
              {profile.full_name ?? profile.email}
            </div>
          </div>

          <button
            // Some browser extensions add `fdprocessedid` before React hydrates.
            // Ignore that external attribute without hiding warnings elsewhere.
            suppressHydrationWarning
            onClick={() => startTransition(() => signOut())}
            title="Sign out"
            aria-label="Sign out"
            className="touch-target ml-0.5 p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-all"
          >
            {pending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <LogOut className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
