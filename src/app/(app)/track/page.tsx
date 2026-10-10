import Link from "next/link";
import { Radar, MapPin, Clock, Package } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { getParcelByTrackingNumber, getTrackingTimeline } from "@/lib/repos/parcels";
import TrackingTimeline from "@/components/parcels/TrackingTimeline";
import StatusBadge from "@/components/ui/StatusBadge";
import PageHeader from "@/components/ui/PageHeader";
import { formatDateTime } from "@/lib/utils";
import ParcelScanner from "@/components/parcels/ParcelScanner";

export const dynamic = "force-dynamic";
export const metadata = { title: "Track Parcel — Airship Express" };

export default async function TrackPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const profile = await requireProfile();
  const { q } = await searchParams;
  const term = q?.trim() ?? "";

  // RLS scopes the lookup: admins find anything, sellers only their parcels,
  // customers only parcels assigned to their account. A parcel the caller
  // cannot see is indistinguishable from a wrong tracking number.
  const parcel = term ? await getParcelByTrackingNumber(term) : null;
  const events = parcel ? await getTrackingTimeline(parcel.id) : [];

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <PageHeader
        eyebrow="Parcel Tracking"
        title="Track Your Parcel"
        description="Enter a tracking number (e.g. TRK-26-000001) to see where your parcel is right now."
      />

      <form
        method="GET"
        className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-6"
      >
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            name="q"
            defaultValue={term}
            required
            placeholder="TRK-26-000123"
            className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-pink-500 transition-all"
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 bg-pink-600 hover:bg-pink-500 text-white px-6 py-3 rounded-xl text-xs font-bold shadow-lg shadow-pink-600/30 transition-all active:scale-95"
          >
            <Radar className="w-4 h-4" />
            Track
          </button>
        </div>
      </form>

      <ParcelScanner />

      {term && !parcel && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-10 text-center">
          <Package className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">
            No parcel found
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            No parcel with tracking number{" "}
            <span className="font-mono">{term}</span> is visible to your account.
            Check the number, or contact the sender if you expected a delivery.
          </p>
        </div>
      )}

      {parcel && (
        <>
          {/* Current position card */}
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-pink-950 rounded-2xl p-6 text-white shadow-lg">
            <div className="flex flex-wrap items-center gap-3 justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-pink-300 font-bold mb-1">
                  Tracking Number
                </p>
                <p className="font-mono text-lg font-black">{parcel.tracking_number}</p>
              </div>
              <StatusBadge status={parcel.status} />
            </div>
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-pink-400 mt-0.5" />
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-pink-300 font-bold">Current Location</p>
                  <p className="font-bold">{parcel.hubName ?? parcel.current_location ?? "Unknown"}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Clock className="w-4 h-4 text-pink-400 mt-0.5" />
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-pink-300 font-bold">Last Updated</p>
                  <p className="font-bold">{formatDateTime(parcel.updated_at)}</p>
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-white/10 border border-white/15 font-bold text-pink-200">
                Delivery Method: {parcel.delivery_method ? parcel.delivery_method.toUpperCase() : "Not specified"}
              </span>
              {parcel.platform && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-white/10 border border-white/15 font-semibold text-slate-200">
                  {parcel.platform}
                </span>
              )}
            </div>
            {parcel.expected_delivery_date && (
              <p className="mt-4 text-xs text-slate-300">
                Expected delivery:{" "}
                <strong>{formatDateTime(parcel.expected_delivery_date).split(" — ")[0]}</strong>
              </p>
            )}
            {profile.role === "Admin" && (
              <Link
                href={`/parcels/${parcel.id}`}
                className="mt-4 inline-block text-xs font-bold text-pink-400 hover:text-pink-300 underline"
              >
                Open full record →
              </Link>
            )}
          </div>

          {/* Timeline */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-6">
            <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 mb-5">
              Tracking History
            </h3>
            <TrackingTimeline currentStatus={parcel.status} events={events} />
          </div>
        </>
      )}
    </div>
  );
}
