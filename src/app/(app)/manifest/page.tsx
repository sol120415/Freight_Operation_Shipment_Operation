import { ClipboardList, Layers } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { listShipments } from "@/lib/repos/shipments";
import { listBatchesWithItems } from "@/lib/repos/batches";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import BatchCreator from "./BatchCreator";
import BatchCards from "./BatchCards";

export const dynamic = "force-dynamic";

export default async function ManifestPage() {
  await requireRole(["SuperAdmin", "Admin"]);
  const [intakeParcels, batches] = await Promise.all([
    listShipments({ status: "Intake", perPage: 100 }),
    listBatchesWithItems(50),
  ]);

  const activeBatches = batches.filter((b) => b.status !== "Handed Over");

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader
        eyebrow="Manifest & Consolidation"
        title="Courier Manifesting"
        description="Group Intake parcels by delivery platform into courier manifests, then mark them Ready for handover."
        actions={
          <span className="bg-pink-50 dark:bg-pink-950/40 text-pink-600 dark:text-pink-400 text-xs font-bold px-3 py-1.5 rounded-full border border-pink-200 dark:border-pink-900 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" /> {intakeParcels.rows.length} ready to batch
          </span>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-1 lg:sticky lg:top-6">
          <BatchCreator parcels={intakeParcels.rows} />
        </div>
        <div className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
              Active Manifests
            </h3>
            <span className="text-[11px] text-slate-400">{activeBatches.length} open</span>
          </div>
          {activeBatches.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No active manifests"
              description="Create the first courier manifest on the left."
            />
          ) : (
            <BatchCards batches={activeBatches} />
          )}
        </div>
      </div>
    </div>
  );
}
