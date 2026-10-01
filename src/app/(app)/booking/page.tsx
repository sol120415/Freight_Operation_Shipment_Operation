import { Plus, PackagePlus } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { listShipments } from "@/lib/repos/shipments";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import BookingForm from "./BookingForm";
import BookingTable from "./BookingTable";

export const dynamic = "force-dynamic";

export default async function BookingPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  await requireRole(["SuperAdmin", "Admin"]);
  const { q, status } = await searchParams;
  const { rows } = await listShipments({
    q,
    status,
    perPage: 50,
  });

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader
        eyebrow="Shipment Booking & Intake"
        title="Parcel Booking — Local Drop-Off Hub"
        description="Intake parcels, tag the delivery platform, and track them through batched → handed-over."
        actions={
          <span className="bg-pink-50 dark:bg-pink-950/40 text-pink-600 dark:text-pink-400 text-xs font-bold px-3 py-1.5 rounded-full border border-pink-200 dark:border-pink-900 flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> New Booking
          </span>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        <div className="lg:col-span-2">
          <BookingForm />
        </div>
        <div className="lg:col-span-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
              Recent Parcels
            </h3>
            <span className="text-[11px] text-slate-400">{rows.length} shown</span>
          </div>

          {rows.length === 0 ? (
            <EmptyState
              icon={PackagePlus}
              title="No parcels yet"
              description="Book your first parcel on the left to get the hub moving."
            />
          ) : (
            <BookingTable rows={rows} />
          )}
        </div>
      </div>

      {q && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Search results for <strong>{q}</strong> — search matches parcel
          reference, tracking number, seller or recipient.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 text-[11px] text-slate-500 dark:text-slate-400">
        <p>
          <strong className="text-slate-700 dark:text-slate-200">Intake</strong> —{" "}
          {rows.filter((r) => r.status === "Intake").length} ready for manifesting
        </p>
        <p>
          <strong className="text-slate-700 dark:text-slate-200">Batched</strong> —{" "}
          {rows.filter((r) => r.status === "Batched").length} awaiting handover
        </p>
        <p>
          <strong className="text-slate-700 dark:text-slate-200">Handed Over</strong> —{" "}
          {rows.filter((r) => r.status === "Handed Over").length} dispatched to courier
        </p>
        <p>
          <strong className="text-slate-700 dark:text-slate-200">Cancelled</strong> —{" "}
          {rows.filter((r) => r.status === "Cancelled").length}
        </p>
      </div>
    </div>
  );
}
