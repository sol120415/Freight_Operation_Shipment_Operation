import Link from "next/link";
import {
  Plus,
  PackageCheck,
  Package,
  Truck,
  Handshake,
  ArrowRight,
  Boxes,
  ShieldCheck,
  Building2,
} from "lucide-react";
import { requireRole } from "@/lib/auth";
import { getHubDashboard } from "@/lib/queries";
import { listParcels } from "@/lib/repos/parcels";
import { computeHubStats, monthlyIntakeVolume } from "@/lib/stats";
import { formatNumber, formatDate } from "@/lib/utils";
import KpiCard from "@/components/ui/KpiCard";
import VolumeChartLazy from "@/components/dashboard/VolumeChartLazy";
import ActivityFeed from "@/components/dashboard/ActivityFeed";
import EmptyState from "@/components/ui/EmptyState";
import { listTrackingLogs } from "@/lib/repos/loadplans";
import type { TrackingLog } from "@/types";
import { isDemoMode } from "@/lib/demoMode";
import PendingOrdersPanel from "@/components/orders/PendingOrdersPanel";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  // Enforce Admin route guard (SuperAdmin inherits admin privileges)
  await requireRole([
    "SuperAdmin",
    "Admin",
  ]);

  const [{ shipments, batches, handovers }, recentLogs, pendingOrders] = await Promise.all([
    getHubDashboard(),
    listTrackingLogs(undefined, 15),
    listParcels({ status: ["Booked", "Registered"], page: 1, pageSize: 8, sort: "created_asc" }),
  ]);
  const demoMode = await isDemoMode();

  const stats = computeHubStats(shipments);
  const volume = monthlyIntakeVolume(shipments);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Admin Operations Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-slate-800 to-pink-950 p-6 rounded-2xl text-white shadow-xl border border-pink-900/40">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-pink-400 mb-1 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-pink-400" />
            <span>Airship Express Admin Command Center</span>
            <span className="bg-pink-600/30 text-pink-300 text-[10px] px-2 py-0.5 rounded-full font-mono border border-pink-500/40">
              ROLE: ADMIN
            </span>
          </div>
          <h1 className="text-2xl font-black tracking-tight">
            Hub Operations &amp; Shipment Execution
          </h1>
          <p className="text-slate-300 text-xs mt-1">
            Full administrative control: Multi-courier intake, manifest consolidation, rider handovers, partner network &amp; audit oversight.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
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
            <span>Manifests</span>
          </Link>
          <Link
            href="/sellers"
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-all"
          >
            <Building2 className="w-4 h-4 text-pink-400" />
            <span>Sellers</span>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
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

      {/* Charts & Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                Monthly Intake by Platform
              </h2>
              <p className="text-slate-500 dark:text-slate-400 text-xs">
                Shopee, GoGo, Flash, TikTok, Laz, J&amp;T &amp; LBC volume metrics
              </p>
            </div>
          </div>
          <VolumeChartLazy data={volume} />
        </div>

        <ActivityFeed initial={recentLogs as TrackingLog[]} live={!demoMode} />
      </div>

      <PendingOrdersPanel orders={pendingOrders.rows} total={pendingOrders.total} compact />

      {/* Open Batches */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
            Open Manifests
          </h2>
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

      {/* Recent Handovers */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800">
          <h2 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
            Recent Courier Handovers
          </h2>
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
