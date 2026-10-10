import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  MapPin,
  Clock,
  User,
  Building2,
  Package,
  CalendarClock,
  Weight,
  Wallet,
} from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { canUpdateParcelStatus } from "@/lib/rbac";
import { getParcelById, getTrackingTimeline } from "@/lib/repos/parcels";
import { listHubs } from "@/lib/repos/hubs";
import TrackingTimeline from "@/components/parcels/TrackingTimeline";
import StatusBadge from "@/components/ui/StatusBadge";
import PageHeader from "@/components/ui/PageHeader";
import ParcelMapLazy from "@/components/map/ParcelMapLazy";
import ShareLocationButton from "@/components/map/ShareLocationButton";
import { formatDate, formatDateTime, formatCurrency } from "@/lib/utils";
import { isDemoMode } from "@/lib/demoMode";
import ParcelOpsPanel from "./ParcelOpsPanel";
import TrackingLinkCard from "./TrackingLinkCard";
import ParcelQrLabel from "@/components/parcels/ParcelQrLabel";

export const dynamic = "force-dynamic";

export default async function ParcelDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireProfile();
  const { id } = await params;
  const demoMode = await isDemoMode();

  // RLS: sellers see only their parcels; customers only assigned ones.
  const parcel = await getParcelById(id);
  if (!parcel) notFound();

  const [events, hubs] = await Promise.all([
    getTrackingTimeline(parcel.id),
    canUpdateParcelStatus(profile.role) && !demoMode
      ? listHubs()
      : Promise.resolve([]),
  ]);

  const staffOps = canUpdateParcelStatus(profile.role) && !demoMode;

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      <Link
        href="/parcels"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-pink-600 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to parcels
      </Link>

      <PageHeader
        eyebrow="Parcel"
        title={parcel.tracking_number ?? parcel.reference}
        description={`Registered ${formatDateTime(parcel.created_at)}`}
        actions={<StatusBadge status={parcel.status} />}
      />

      {/* Current position banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-pink-950 rounded-2xl p-4 sm:p-5 text-white shadow-lg grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-white/10 shrink-0">
            <Package className="w-5 h-5 text-pink-400" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-pink-300 font-bold">
              Current Status
            </p>
            <p className="text-lg font-black">{parcel.status}</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-white/10 shrink-0">
            <MapPin className="w-5 h-5 text-pink-400" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-pink-300 font-bold">
              Current Location
            </p>
            <p className="text-sm font-bold">{parcel.hubName ?? parcel.current_location ?? "Unknown"}</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-white/10 shrink-0">
            <Clock className="w-5 h-5 text-pink-400" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-pink-300 font-bold">
              Last Updated
            </p>
            <p className="text-sm font-bold">
              {parcel.updated_at ? formatDateTime(parcel.updated_at) : "—"}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Details */}
        <div className="lg:col-span-1 space-y-4 order-2 lg:order-1">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-5 space-y-4">
            <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">
              Parcel Details
            </h3>
            <dl className="space-y-3 text-xs">
              <Detail icon={User} label="Recipient" value={parcel.consignee ?? "—"} sub={parcel.recipient_phone} />
              <Detail icon={Building2} label="Seller" value={parcel.sellerName ?? "Walk-in"} sub={parcel.sellerReference ?? undefined} />
              <Detail
                icon={Package}
                label="Delivery Method"
                value={parcel.delivery_method ? parcel.delivery_method.toUpperCase() : "Not specified"}
              />
              <Detail icon={MapPin} label="Route" value={`${parcel.origin} → ${parcel.destination}`} />
              <Detail
                icon={CalendarClock}
                label="Expected Delivery"
                value={
                  parcel.expected_delivery_date
                    ? formatDate(parcel.expected_delivery_date)
                    : "—"
                }
              />
              <Detail
                icon={Weight}
                label="Weight / Dimensions"
                value={`${Number(parcel.weight_kg).toFixed(2)} kg${
                  parcel.dimensions ? ` · ${parcel.dimensions} cm` : ""
                }`}
              />
              <Detail
                icon={Wallet}
                label="Fees"
                value={`${formatCurrency(Number(parcel.shipping_fee ?? 0))}${
                  Number(parcel.cod_amount) > 0
                    ? ` · COD ${formatCurrency(Number(parcel.cod_amount))}`
                    : ""
                }`}
              />
              {parcel.description && (
                <Detail icon={Package} label="Description" value={parcel.description} />
              )}
            </dl>
          </div>

          <ParcelQrLabel
            trackingNumber={parcel.tracking_number ?? parcel.reference}
            reference={parcel.reference}
            destination={parcel.destination}
          />

          {staffOps && hubs.length >= 0 && (
            <ParcelOpsPanel
              parcelId={parcel.id}
              currentStatus={parcel.status}
              currentHubId={parcel.current_hub_id}
              deliveryMethod={parcel.delivery_method}
              hubs={hubs.map((h) => ({ id: h.id, name: h.name }))}
            />
          )}

          {/* RLS guarantees a Seller only ever sees their own parcels. */}
          {profile.role === "Seller" && !demoMode && (
            <TrackingLinkCard parcelId={parcel.id} />
          )}
        </div>

        {/* Timeline + map */}
        <div className="lg:col-span-2 order-1 lg:order-2 space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-6">
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">
                Live Location
              </h3>
              {staffOps && <ShareLocationButton parcelId={parcel.id} />}
            </div>
            <ParcelMapLazy
              parcelId={parcel.id}
              lat={parcel.current_lat}
              lng={parcel.current_lng}
              trackingNumber={parcel.tracking_number ?? parcel.reference}
            />
            <p className="mt-2 text-[11px] text-slate-400">
              Position updates stream live over WebSocket. Visited map tiles are
              cached for offline viewing; the last known position always stays visible.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-6">
            <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 mb-5">
              Tracking History
            </h3>
            <TrackingTimeline currentStatus={parcel.status} events={events} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Detail({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string | null;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <dt className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
          {label}
        </dt>
        <dd className="font-semibold text-slate-700 dark:text-slate-200 break-words">
          {value}
          {sub && (
            <span className="block text-[11px] text-slate-400 font-normal">{sub}</span>
          )}
        </dd>
      </div>
    </div>
  );
}
