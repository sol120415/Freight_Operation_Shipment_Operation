"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X, Loader2 } from "lucide-react";
import { PARCEL_STATUSES } from "@/lib/utils";
import { SETTABLE_STATUSES } from "@/lib/parcelWorkflow";

/**
 * Debounced search + status filter bar for the parcel table.
 * Updates the URL query (server-side filtering) without full reloads.
 */
export default function ParcelFilters({ basePath }: { basePath: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [term, setTerm] = useState(searchParams.get("q") ?? "");

  const q = searchParams.get("q") ?? "";
  const status = searchParams.get("status") ?? "";

  // Keep the controlled input aligned when a parent link clears the URL
  // (for example, the empty-state “Clear filters” link).
  useEffect(() => {
    setTerm(q);
  }, [q]);

  const push = useCallback((patch: Record<string, string | undefined>) => {
    const qs = new URLSearchParams();
    const merged = { q, status, ...patch };
    for (const [k, v] of Object.entries(merged)) {
      if (v && k !== "page") qs.set(k, v);
    }
    startTransition(() => router.replace(`${basePath}?${qs.toString()}`));
  }, [basePath, q, router, startTransition, status]);

  // Debounced sync of the search box into the URL.
  useEffect(() => {
    const t = setTimeout(() => {
      if (term === q) return;
      push({ q: term || undefined });
    }, 350);
    return () => clearTimeout(t);
  }, [push, q, term]);

  const hasFilters = !!(q || status);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-5 py-4 border-b border-slate-100 dark:border-slate-800">
      <div className="relative flex-1 min-w-0 w-full">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search tracking #, reference, recipient..."
          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-9 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-pink-500 transition-all"
        />
        {pending && (
          <Loader2 className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-pink-500 animate-spin" />
        )}
        {!pending && term && (
          <button
            aria-label="Clear search"
            onClick={() => {
              setTerm("");
              push({ q: undefined });
            }}
            className="touch-target absolute right-1 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <select
        value={status}
        onChange={(e) => push({ status: e.target.value || undefined })}
        className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-pink-500"
        aria-label="Filter by status"
      >
        <option value="">All statuses</option>
        {[...new Set([...SETTABLE_STATUSES, ...PARCEL_STATUSES])].map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      {hasFilters && (
        <button
          onClick={() => {
            setTerm("");
            startTransition(() => router.replace(basePath));
          }}
          className="text-xs font-bold text-pink-600 dark:text-pink-400 hover:underline whitespace-nowrap"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
