import Link from "next/link";
import { ClipboardCheck, Package, Radar, Truck } from "lucide-react";
import { can, requirePermission } from "@/lib/auth";
import { listParcels } from "@/lib/repos/parcels";
import KpiCard from "@/components/ui/KpiCard";
import PageHeader from "@/components/ui/PageHeader";
import PendingOrdersPanel from "@/components/orders/PendingOrdersPanel";

export const dynamic = "force-dynamic";

/** Separate workspace for operational staff. It is not the Admin dashboard. */
export default async function OperationsDashboardPage() {
  const profile = await requirePermission("orders.viewPending");
  const pendingResult = await listParcels({
    status: ["Booked", "Registered"],
    page: 1,
    pageSize: 100,
    sort: "created_asc",
  });

  const { rows: activeParcels } = await listParcels({
    status: ["Intake", "Batched", "Handed Over", "In Transit", "At Destination Hub", "Out for Delivery"],
    page: 1,
    pageSize: 100,
    sort: "updated_desc",
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <PageHeader
        eyebrow="Operations Staff Portal"
        title="Order Processing Workspace"
        description="Review incoming orders, confirm the details, and send accepted orders into hub intake."
        actions={
          <Link href="/operations/orders" className="inline-flex items-center gap-2 rounded-xl bg-pink-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-pink-600/20 hover:bg-pink-500">
            <ClipboardCheck className="w-4 h-4" /> Open queue
          </Link>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard label="Pending Orders" value={pendingResult.total} icon={ClipboardCheck} tone="pink" hint="Needs confirmation" />
        <KpiCard label="Active Parcels" value={activeParcels.length} icon={Package} tone="blue" hint="Already in operations" />
        <KpiCard label="Ready to Track" value={activeParcels.filter((p) => ["In Transit", "At Destination Hub", "Out for Delivery"].includes(p.status)).length} icon={Truck} tone="amber" hint="Moving through delivery" />
        <KpiCard label="Tracking" value={activeParcels.filter((p) => p.status === "Out for Delivery").length} icon={Radar} tone="emerald" hint="Out for delivery" />
      </div>

      <PendingOrdersPanel
        orders={pendingResult.rows}
        total={pendingResult.total}
        canProcess={can(profile.role, "orders.process")}
      />
    </div>
  );
}
