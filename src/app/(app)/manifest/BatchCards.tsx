"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, RotateCcw } from "lucide-react";
import { markBatchReady, releaseBatch } from "./actions";
import StatusBadge from "@/components/ui/StatusBadge";
import { formatDate } from "@/lib/utils";
import type { CarrierBatchWithItems } from "@/types";

export default function BatchCards({ batches }: { batches: CarrierBatchWithItems[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);

  function ready(batch: { id: string }) {
    setPendingId(batch.id);
    void markBatchReady(batch.id).then((res) => {
      setPendingId(null);
      if (!res.ok) window.alert(res.error ?? "Could not mark ready");
      else router.refresh();
    });
  }

  function release(batch: { id: string }) {
    setPendingId(batch.id);
    void releaseBatch(batch.id).then((res) => {
      setPendingId(null);
      if (!res.ok) window.alert(res.error ?? "Could not release batch");
      else router.refresh();
    });
  }

  if (!batches.length) return null;

  return (
    <div className="space-y-4">
      {batches.map((b) => (
        <div
          key={b.id}
          className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden"
        >
          <div className="p-4 flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <div className="font-mono text-xs text-slate-700 dark:text-slate-300 font-bold">
                {b.reference}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {b.platform} · {b.parcel_count} parcels · {Number(b.total_weight_kg).toFixed(1)} kg
              </div>
            </div>
            <StatusBadge status={b.status} />
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-56 overflow-y-auto">
            {b.items.map((it) => (
              <div key={it.id} className="flex items-center justify-between px-4 py-2 text-xs">
                <span className="font-mono text-[11px] text-slate-600 dark:text-slate-300">
                  {it.reference}
                </span>
                <span className="text-slate-500 dark:text-slate-400">
                  {it.consignee ?? it.client_name} → {it.destination}
                </span>
              </div>
            ))}
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between">
            <span className="text-[10px] text-slate-400">Created {formatDate(b.created_at)}</span>
            <div className="flex items-center gap-2">
              {b.status === "Draft" && (
                <>
                  <button
                    onClick={() => release(b)}
                    disabled={pendingId === b.id}
                    className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 rounded-md hover:bg-slate-50 transition-colors disabled:opacity-50"
                  >
                    <RotateCcw className="w-3 h-3" /> Release
                  </button>
                  <button
                    onClick={() => ready(b)}
                    disabled={pendingId === b.id}
                    className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 px-2.5 py-1.5 rounded-md hover:bg-emerald-100 transition-colors disabled:opacity-50"
                  >
                    {pendingId === b.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Check className="w-3 h-3" />
                    )}
                    Mark Ready
                  </button>
                </>
              )}
              {b.status === "Ready" && (
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                  Awaiting handover sign-off
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
