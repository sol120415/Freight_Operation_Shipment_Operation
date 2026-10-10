import Link from "next/link";
import { AlertTriangle, Clock3, PackageX, Truck } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { getOperationalExceptions } from "@/lib/repos/exceptions";
import { formatDateTime } from "@/lib/utils";
import PageHeader from "@/components/ui/PageHeader";
import StatusBadge from "@/components/ui/StatusBadge";

export const dynamic = "force-dynamic";
export const metadata = { title: "Operations Exceptions — Airship Express" };

export default async function ExceptionsPage() {
  await requireRole(["SuperAdmin", "Admin"]);
  const { parcels, handovers } = await getOperationalExceptions();
  const critical = parcels.filter((item) => item.severity === "critical").length;
  const overdue = parcels.filter((item) => item.issues.includes("Past expected delivery date")).length;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        eyebrow="Operational Control"
        title="Exception Monitor"
        description="Parcels needing attention, overdue movements, and manifests still waiting for handover."
      />

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Metric icon={PackageX} label="Critical parcel issues" value={critical} tone="rose" />
        <Metric icon={Clock3} label="Past expected delivery" value={overdue} tone="amber" />
        <Metric icon={Truck} label="Ready for handover" value={handovers.length} tone="blue" />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 p-5 dark:border-slate-800">
          <h2 className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-slate-100">
            <AlertTriangle className="h-4 w-4 text-rose-500" /> Parcels requiring action
          </h2>
        </div>
        {parcels.length === 0 ? (
          <p className="p-10 text-center text-xs text-slate-500">No active parcel exceptions were found.</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {parcels.map((item) => (
              <Link
                key={item.parcelId}
                href={`/parcels/${item.parcelId}`}
                className="grid gap-3 px-5 py-4 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40 md:grid-cols-[1.2fr_1fr_1fr_1.6fr_auto] md:items-center"
              >
                <div>
                  <p className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200">{item.trackingNumber}</p>
                  <p className="text-[10px] text-slate-400">{item.sellerName}</p>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300">{item.destination}</p>
                <StatusBadge status={item.status} />
                <div className="flex flex-wrap gap-1.5">
                  {item.issues.map((issue) => (
                    <span
                      key={issue}
                      className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                        item.severity === "critical"
                          ? "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
                      }`}
                    >
                      {issue}
                    </span>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400">{formatDateTime(item.updatedAt)}</p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-black text-slate-900 dark:text-slate-100">Unresolved handovers</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {handovers.map((handover) => (
            <Link key={handover.id} href="/handover" className="rounded-xl border border-slate-200 p-4 hover:border-pink-300 dark:border-slate-700">
              <p className="font-mono text-xs font-bold">{handover.reference}</p>
              <p className="mt-1 text-[11px] text-slate-500">{handover.platform} · {handover.parcelCount} parcels</p>
              <p className={`mt-2 text-[10px] font-bold ${handover.waitingHours >= 24 ? "text-amber-600" : "text-slate-400"}`}>
                Waiting {handover.waitingHours} hour{handover.waitingHours === 1 ? "" : "s"}
              </p>
            </Link>
          ))}
          {handovers.length === 0 && <p className="text-xs text-slate-500">No manifests are waiting for handover.</p>}
        </div>
      </section>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone: "rose" | "amber" | "blue";
}) {
  const colors = {
    rose: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-900",
    amber: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900",
    blue: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-900",
  };
  return (
    <div className={`rounded-2xl border p-5 ${colors[tone]}`}>
      <Icon className="h-5 w-5" />
      <p className="mt-3 text-2xl font-black">{value}</p>
      <p className="text-[11px] font-bold uppercase tracking-wide">{label}</p>
    </div>
  );
}
