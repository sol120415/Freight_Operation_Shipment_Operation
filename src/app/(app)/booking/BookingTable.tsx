"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Archive, Loader2 } from "lucide-react";
import { cancelBooking, archiveBooking } from "./actions";
import StatusBadge from "@/components/ui/StatusBadge";
import TableScroll from "@/components/ui/TableScroll";
import { formatDate, formatNumber } from "@/lib/utils";
import type { Shipment } from "@/types";

export default function BookingTable({ rows }: { rows: Shipment[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function doCancel(shipment: Shipment) {
    const reason = window.prompt(`Cancellation reason for ${shipment.reference}:`);
    if (!reason || !reason.trim()) return;
    setPendingId(shipment.id);
    setError(null);
    void cancelBooking(shipment.id, reason.trim()).then((res) => {
      setPendingId(null);
      if (!res.ok) setError(res.error ?? "Cancel failed");
      else router.refresh();
    });
  }

  function doArchive(shipment: Shipment) {
    setPendingId(shipment.id);
    setError(null);
    void archiveBooking(shipment.id).then((res) => {
      setPendingId(null);
      if (!res.ok) setError(res.error ?? "Archive failed");
      else router.refresh();
    });
  }

  function RowActions({ r }: { r: Shipment }) {
    if (r.status === "Handed Over" || r.status === "Cancelled") {
      return (
        <span className="text-[10px] text-slate-400">
          {formatNumber(r.weight_kg)} kg
        </span>
      );
    }
    return (
      <div className="flex items-center justify-end gap-1.5">
        {pendingId === r.id && (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />
        )}
        {r.status !== "Archived" && (
          <button
            onClick={() => doArchive(r)}
            title="Archive"
            aria-label="Archive parcel"
            className="touch-target p-2 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <Archive className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={() => doCancel(r)}
          title="Cancel"
          aria-label="Cancel parcel"
          className="touch-target p-2 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
        >
          <Ban className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div>
      <TableScroll className="hidden md:block">
        <table className="w-full text-xs min-w-[40rem]">
          <thead className="text-[10px] uppercase tracking-wider text-slate-400">
            <tr className="border-b border-slate-100 dark:border-slate-800">
              <th className="text-left px-5 py-3">Ref</th>
              <th className="text-left px-3 py-3">Seller / Recipient</th>
              <th className="text-left px-3 py-3">Platform</th>
              <th className="text-left px-3 py-3">Destination</th>
              <th className="text-left px-3 py-3">Status</th>
              <th className="text-right px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                <td className="px-5 py-3 font-mono text-[11px] text-slate-700 dark:text-slate-300">
                  <span className="break-all">{r.reference}</span>
                  <div className="text-[10px] text-slate-400 font-sans">
                    {formatDate(r.created_at)}
                  </div>
                </td>
                <td className="px-3 py-3 min-w-0">
                  <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                    {r.client_name}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate">{r.consignee ?? "—"}</div>
                </td>
                <td className="px-3 py-3">{r.platform}</td>
                <td className="px-3 py-3 text-slate-600 dark:text-slate-300 max-w-[10rem] truncate">
                  {r.destination}
                </td>
                <td className="px-3 py-3">
                  <StatusBadge status={r.status} />
                </td>
                <td className="px-5 py-3">
                  <RowActions r={r} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>

      <ul className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
        {rows.map((r) => (
          <li key={r.id} className="px-5 py-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono text-xs font-bold text-slate-800 dark:text-slate-100 break-all">
                  {r.reference}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">{formatDate(r.created_at)}</p>
              </div>
              <StatusBadge status={r.status} />
            </div>
            <p className="text-xs text-slate-700 dark:text-slate-200">
              <span className="font-semibold">{r.client_name}</span>
              {r.consignee ? ` · ${r.consignee}` : ""}
            </p>
            <p className="text-[11px] text-slate-500 break-words">
              {r.platform} → {r.destination}
            </p>
            <div className="flex justify-end pt-1">
              <RowActions r={r} />
            </div>
          </li>
        ))}
      </ul>

      {error && (
        <p className="px-5 py-3 text-[11px] text-rose-600 dark:text-rose-400">{error}</p>
      )}
    </div>
  );
}
