import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Activity,
  Plus,
  PackageCheck,
  Package,
  Truck,
  Handshake,
  ArrowRight,
  Boxes,
} from "lucide-react";
import { requireProfile, isStaff, isAdminRole, isOpsStaffRole, isSellerRole, isCustomerRole, isCitizenRole, isCourierRole } from "@/lib/auth";
import { getHubDashboard, getShipments } from "@/lib/queries";import { computeHubStats, monthlyIntakeVolume } from "@/lib/stats";
import { formatNumber } from "@/lib/utils";
import KpiCard from "@/components/ui/KpiCard";
import VolumeChartLazy from "@/components/dashboard/VolumeChartLazy";
import ActivityFeed from "@/components/dashboard/ActivityFeed";
import SellerDashboard from "@/components/dashboard/SellerDashboard";
import CustomerDashboard from "@/components/dashboard/CustomerDashboard";
import EmptyState from "@/components/ui/EmptyState";
import { listTrackingLogs } from "@/lib/repos/loadplans";
import { formatDate } from "@/lib/utils";
import type { TrackingLog } from "@/types";
import { isDemoMode } from "@/lib/demoMode";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const profile = await requireProfile();

  // ---- Redirect internal operations staff to dedicated operations dashboard ----
  if (isAdminRole(profile.role)) {
    redirect("/admin/dashboard");
  }

  if (isOpsStaffRole(profile.role)) {
    redirect("/operations/dashboard");
  }

  // Couriers use the parcel list, which is RLS-scoped to their assignments.
  if (isCourierRole(profile.role)) {
    redirect("/parcels");
  }

  // ---- Seller view: their own parcels only ----
  if (isSellerRole(profile.role)) {
    const parcels = await getShipments();
    return <SellerDashboard parcels={parcels} sellerName={null} />;
  }

  // ---- Customer/Citizen view: assigned parcels, deliberately simple ----
  if (isCustomerRole(profile.role) || isCitizenRole(profile.role)) {
    const parcels = await getShipments();
    return <CustomerDashboard parcels={parcels} />;
  }

  // ---- Staff / admin operations view ----
  const staff = isStaff(profile.role);
  const demoMode = await isDemoMode();

  const [{ shipments, batches, handovers }, recentLogs] = await Promise.all([
    getHubDashboard(),
    listTrackingLogs(undefined, 15),
  ]);

  const stats = computeHubStats(shipments);
  const volume = monthlyIntakeVolume(shipments);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-slate-800 to-pink-950 p-6 rounded-2xl text-white shadow-xl">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-pink-400 mb-1 flex items-center gap-2">
            <Activity className="w-4 h-4" /> Authorized Drop-Off Hub — Branch Hub
          </div>
          <h2 className="text-2xl font-black tracking-tight">
            Parcel Intake &amp; Courier Operations
          </h2>
          <p className="text-slate-300 text-xs mt-1">
            Intake → manifest → handover for J&amp;T, Flash, LBC, GoGo, Shopee,
            Lazada and TikTok couriers.
          </p>
        </div>
        {staff && (
          <div className="flex items-center gap-3">
            <Link
              href="/booking"
              className="bg-pink-600 hover:bg-pink-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-lg shadow-pink-600/30 flex items-center space-x-2 transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Intake New Parcel</span>
            </Link>
            <Link
              href="/manifest"
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center space-x-2 transition-all"
            >
              <Truck className="w-4 h-4" />
              <span>Manifest</span>
            </Link>
          </div>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Active Parcels"
          value={stats.activeParcels}
          icon={Package}
          tone="pink"
          hint={`${formatNumber(stats.totalWeightKg)} kg total weight`}
        />
        <KpiCard
          label="Intaken Today"
          value={stats.intakeToday}
          icon={PackageCheck}
          tone="blue"
          hint="At Intake, ready to manifest"
        />
        <KpiCard
          label="Pending Handovers"
          value={stats.pendingHandovers}
          icon={Handshake}
          tone="amber"
          hint={stats.pendingHandovers ? "Batched — waiting for rider" : "All manifests dispatched"}
        />
        <KpiCard
          label="Completed Dispatches"
          value={stats.completedDispatches}
          icon={Truck}
          tone="emerald"
          hint={`${stats.cancelled} cancelled`}
        />
      </div>

      {/* Charts + feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                Monthly Intake by Platform
              </h3>
              <p className="text-slate-500 dark:text-slate-400 text-xs">
                Parcels intaken per courier platform per month
              </p>
            </div>
          </div>
          <VolumeChartLazy data={volume} />
        </div>

        <ActivityFeed initial={(recentLogs) as TrackingLog[]} live={!demoMode} />
      </div>

      {/* Open batches */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
            Open Manifests
          </h3>
          <Link
            href="/handover"
            className="text-[11px] font-bold text-pink-600 dark:text-pink-400 flex items-center gap-1 hover:underline"
          >
            Hand over now <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        {batches.length === 0 ? (
          <EmptyState
            icon={Boxes}
            title="No open manifests"
            description="Create a batch from the Manifest page once parcels are intaken."
          />
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {batches.map((b) => (
              <div key={b.id} className="px-5 py-3 flex items-center justify-between text-xs">
                <div>
                  <span className="font-mono text-[11px] font-bold text-slate-700 dark:text-slate-300">
                    {b.reference}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400 ml-2">
                    {b.platform} · {b.parcel_count} parcels · {Number(b.total_weight_kg).toFixed(1)} kg
                  </span>
                </div>
                <span className="text-[10px] text-slate-400">
                  {b.status === "Ready" ? "Ready for sign-off" : formatDate(b.created_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent handovers */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800">
          <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
            Recent Handovers
          </h3>
        </div>
        {handovers.length === 0 ? (
          <EmptyState
            icon={Handshake}
            title="No handovers yet"
            description="Completed rider handovers will appear here."
          />
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {handovers.map((h) => (
              <div key={h.id} className="px-5 py-3 flex items-center justify-between text-xs">
                <span className="text-slate-600 dark:text-slate-300">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{h.platform}</span>{" "}
                  → {h.rider_name} · {h.parcel_count} parcels
                </span>
                <span className="text-[10px] text-slate-400">{formatDate(h.handed_over_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
