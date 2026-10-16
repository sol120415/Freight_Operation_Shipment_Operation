"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2, ClipboardList, Loader2 } from "lucide-react";
import type { ParcelRow } from "@/lib/repos/parcels";
import { updateParcelStatus } from "@/app/(app)/parcels/actions";
import EmptyState from "@/components/ui/EmptyState";
import StatusBadge from "@/components/ui/StatusBadge";
import { formatDate } from "@/lib/utils";

/**
 * Shared pending-order queue used by the Operations portal and the Admin
 * dashboard. Operations users can confirm an order; Admin sees a read-only
 * oversight view so the processing work stays separate from administration.
 */
export default function PendingOrdersPanel({
  orders,
  total,
  canProcess = false,
  compact = false,
}: {
  orders: ParcelRow[];
  total?: number;
  canProcess?: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirmOrder(order: ParcelRow) {
    setError(null);
    setPendingId(order.id);
    startTransition(async () => {
      const result = await updateParcelStatus({
        parcelId: order.id,
        status: "Intake",
        location: "Branch Hub",
        description: "Order confirmed and accepted by the order processing desk",
      });
      setPendingId(null);
      if (!result.ok) {
        setError(result.error ?? "The order could not be confirmed.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
      <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-pink-500" />
            Pending Orders
          </h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Booked or registered orders waiting for confirmation and hub intake.
          </p>
        </div>
        <span className="text-[11px] font-bold text-slate-400 whitespace-nowrap">
          {total ?? orders.length} waiting
        </span>
      </div>

      {error && (
        <p className="mx-5 mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
          {error}
        </p>
      )}

      {orders.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="No pending orders"
          description="New seller orders will appear here until they are confirmed for intake."
        />
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {orders.slice(0, compact ? 8 : orders.length).map((order) => (
            <div key={order.id} className="px-5 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="min-w-0">
                <Link href={`/parcels/${order.id}`} className="font-mono text-xs font-bold text-pink-600 dark:text-pink-400 hover:underline">
                  {order.tracking_number ?? order.reference}
                </Link>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 truncate mt-0.5">
                  {order.sellerName ?? "Walk-in seller"} · {order.consignee ?? "No recipient"} · {order.destination ?? "No destination"}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">Received {formatDate(order.created_at)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <StatusBadge status={order.status} />
                {canProcess && (
                  <button
                    type="button"
                    onClick={() => confirmOrder(order)}
                    disabled={pending || pendingId === order.id}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-pink-600 px-3 py-2 text-[11px] font-bold text-white hover:bg-pink-500 disabled:opacity-60"
                  >
                    {pendingId === order.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Confirm &amp; receive
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {compact && (total ?? orders.length) > orders.length && (
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800">
          <Link href="/operations/orders" className="text-[11px] font-bold text-pink-600 dark:text-pink-400 hover:underline">
            Open full processing queue →
          </Link>
        </div>
      )}
    </section>
  );
}
