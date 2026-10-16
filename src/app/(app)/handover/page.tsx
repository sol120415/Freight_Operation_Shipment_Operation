import { Handshake, History } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { listReadyBatches } from "@/lib/repos/batches";
import { listHandovers } from "@/lib/repos/handovers";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import HandoverSignoff from "./HandoverSignoff";
import HandoverHistory from "./HandoverHistory";

export const dynamic = "force-dynamic";

export default async function HandoverPage() {
  await requirePermission("handover.view");
  const [readyBatches, handovers] = await Promise.all([
    listReadyBatches(),
    listHandovers(50),
  ]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader
        eyebrow="Carrier Handover & History"
        title="Rider Sign-off & Dispatch Records"
        description="Riders sign for Ready manifests; the handover is stamped and archived for audit."
        actions={
          <span className="bg-pink-50 dark:bg-pink-950/40 text-pink-600 dark:text-pink-400 text-xs font-bold px-3 py-1.5 rounded-full border border-pink-200 dark:border-pink-900 flex items-center gap-1.5">
            <Handshake className="w-3.5 h-3.5" /> {readyBatches.length} ready for sign-off
          </span>
        }
      />

      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800">
          <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
            Ready for Handover
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            These manifests were marked Ready in Manifest &amp; Consolidation.
          </p>
        </div>
        {readyBatches.length === 0 ? (
          <EmptyState
            icon={Handshake}
            title="Nothing ready to hand over"
            description="Mark a manifest Ready in the manifest module first."
          />
        ) : (
          <HandoverSignoff batches={readyBatches} />
        )}
      </section>

      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
            <History className="w-4 h-4 text-slate-400" /> Handover History
          </h3>
          <span className="text-[11px] text-slate-400">{handovers.length} records</span>
        </div>
        {handovers.length === 0 ? (
          <EmptyState
            icon={History}
            title="No handovers yet"
            description="Once riders sign off manifests, the records appear here."
          />
        ) : (
          <HandoverHistory handovers={handovers} />
        )}
      </section>
    </div>
  );
}
