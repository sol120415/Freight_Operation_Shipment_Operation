"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { updatePickupStatus } from "./actions";
import StatusBadge from "@/components/ui/StatusBadge";
import { formatDate } from "@/lib/utils";
import type { PickupRequestWithSeller } from "@/types";

const NEXT: Record<string, string> = {
  Scheduled: "In Transit",
  "In Transit": "Received",
  Received: "",
};

export default function PickupRequests({
  pickups,
}: {
  pickups: PickupRequestWithSeller[];
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [actualCounts, setActualCounts] = useState<Record<string, number>>({});

  function advance(pickup: PickupRequestWithSeller) {
    const next = NEXT[pickup.status];
    if (!next) return;
    setPendingId(pickup.id);
    const actual = next === "Received"
      ? (actualCounts[pickup.id] ?? pickup.actual_parcel_count ?? pickup.expected_parcel_count)
      : undefined;
    void updatePickupStatus(pickup.id, next, actual).then((res) => {
      setPendingId(null);
      if (!res.ok) window.alert(res.error ?? "Update failed");
      else router.refresh();
    });
  }

  return (
    <div className="table-scroll">
      <table className="w-full text-xs">
        <thead className="text-[10px] uppercase tracking-wider text-slate-400">
          <tr className="border-b border-slate-100 dark:border-slate-800">
            <th className="text-left px-5 py-3">Ref</th>
            <th className="text-left px-3 py-3">Seller</th>
            <th className="text-left px-3 py-3">Scheduled</th>
            <th className="text-right px-3 py-3">Expected / Actual</th>
            <th className="text-left px-3 py-3">Status</th>
            <th className="text-right px-5 py-3">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {pickups.map((p) => (
            <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
              <td className="px-5 py-3 font-mono text-[11px] text-slate-700 dark:text-slate-300">
                {p.reference}
              </td>
              <td className="px-3 py-3">
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {p.seller?.name ?? "—"}
                </span>
                <span className="block text-[10px] text-slate-400">{p.seller?.phone}</span>
              </td>
              <td className="px-3 py-3 text-slate-600 dark:text-slate-300">
                {formatDate(p.scheduled_at)}
              </td>
              <td className="px-3 py-3 text-right">
                <span>{p.expected_parcel_count}</span>
                <span className="text-slate-400"> / </span>
                {p.status === "In Transit" ? (
                  <input
                    type="number"
                    min={0}
                    aria-label={`Actual parcels received for ${p.reference}`}
                    value={actualCounts[p.id] ?? p.actual_parcel_count ?? p.expected_parcel_count}
                    onChange={(event) => setActualCounts((current) => ({
                      ...current,
                      [p.id]: Number(event.target.value),
                    }))}
                    className="w-16 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-right"
                  />
                ) : (
                  <span className={p.actual_parcel_count !== null && p.actual_parcel_count !== p.expected_parcel_count ? "font-bold text-amber-600" : ""}>
                    {p.actual_parcel_count ?? "—"}
                  </span>
                )}
              </td>
              <td className="px-3 py-3">
                <StatusBadge status={p.status} />
              </td>
              <td className="px-5 py-3 text-right">
                {NEXT[p.status] ? (
                  <button
                    onClick={() => advance(p)}
                    disabled={pendingId === p.id}
                    className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 py-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                  >
                    {pendingId === p.id && <Loader2 className="w-3 h-3 animate-spin" />}
                    Mark {NEXT[p.status]}
                  </button>
                ) : (
                  <span className="text-[10px] text-slate-400">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
