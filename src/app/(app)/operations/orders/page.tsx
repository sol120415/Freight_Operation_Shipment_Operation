import Link from "next/link";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { can, requirePermission } from "@/lib/auth";
import { listParcels } from "@/lib/repos/parcels";
import PageHeader from "@/components/ui/PageHeader";
import PendingOrdersPanel from "@/components/orders/PendingOrdersPanel";

export const dynamic = "force-dynamic";

export default async function OperationsOrdersPage() {
  const profile = await requirePermission("orders.viewPending");
  const pendingResult = await listParcels({
    status: ["Booked", "Registered"],
    page: 1,
    pageSize: 100,
    sort: "created_asc",
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <PageHeader
        eyebrow="Operations Staff Portal"
        title="Pending Order Queue"
        description="This is where newly booked or seller-registered orders wait for confirmation before intake."
        actions={
          <Link href="/operations/dashboard" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
            <ArrowLeft className="w-4 h-4" /> Operations home
          </Link>
        }
      />
      <PendingOrdersPanel
        orders={pendingResult.rows}
        total={pendingResult.total}
        canProcess={can(profile.role, "orders.process")}
      />
      {pendingResult.rows.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-xs text-slate-500 dark:border-slate-700">
          <ClipboardList className="mx-auto mb-2 h-5 w-5 text-slate-400" />
          The queue is clear. New pending orders will appear here automatically.
        </div>
      )}
    </div>
  );
}
