import { PackageSearch, Truck, UsersRound } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { listSellers } from "@/lib/repos/sellers";
import { listPickups } from "@/lib/repos/pickups";
import { listShipments } from "@/lib/repos/shipments";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import SellerForm from "./SellerForm";
import PickupScheduleForm from "./PickupScheduleForm";
import PickupRequests from "./PickupRequests";
import QuickIntake from "./QuickIntake";

export const dynamic = "force-dynamic";

export default async function PickupPage() {
  await requirePermission("pickup.manage");
  const [sellers, pickups, { rows: intakenToday }] = await Promise.all([
    listSellers(),
    listPickups(),
    listShipments({ status: "Intake", perPage: 50 }),
  ]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader
        eyebrow="Seller Pickup & Intake"
        title="Pickup Scheduling & Parcel Intake"
        description="Register sellers, schedule pickups, and intake walk-in parcels at the counter."
        actions={
          <span className="bg-pink-50 dark:bg-pink-950/40 text-pink-600 dark:text-pink-400 text-xs font-bold px-3 py-1.5 rounded-full border border-pink-200 dark:border-pink-900 flex items-center gap-1.5">
            <Truck className="w-3.5 h-3.5" /> {pickups.length} pickup requests
          </span>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div className="space-y-6">
          <SellerForm />
          <PickupScheduleForm sellers={sellers} />
        </div>
        <div className="space-y-6">
          <QuickIntake sellers={sellers} />
        </div>
      </div>

      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
            <UsersRound className="w-4 h-4 text-slate-400" /> Pickup Requests
          </h3>
          <span className="text-[11px] text-slate-400">
            {pickups.filter((p) => p.status === "Scheduled").length} scheduled
          </span>
        </div>
        {pickups.length === 0 ? (
          <EmptyState
            icon={PackageSearch}
            title="No pickup requests yet"
            description="Schedule the first seller pickup above."
          />
        ) : (
          <PickupRequests pickups={pickups} />
        )}
      </section>

      <div className="text-[11px] text-slate-500 dark:text-slate-400">
        <strong className="text-slate-700 dark:text-slate-200">Today&apos;s intake</strong> —{" "}
        {intakenToday.length} parcel{intakenToday.length === 1 ? "" : "s"} sitting at Intake,
        waiting to be batched in Manifest & Consolidation.
      </div>
    </div>
  );
}
