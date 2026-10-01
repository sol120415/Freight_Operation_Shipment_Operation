import { Settings } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import PageHeader from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings — Airship Express" };

export default async function SettingsPage() {
  await requirePermission("settings.manage");

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <PageHeader
        eyebrow="Administration"
        title="System Settings"
        description="Platform-level configuration. Sensitive settings are managed via environment variables and the database."
      />

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-6 space-y-4 text-xs">
        <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Settings className="w-4 h-4 text-pink-600" />
          Platform
        </h3>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Setting label="Application" value="Airship Express — Freight Operations & Shipment Execution v3.1" />
          <Setting label="Database" value="Supabase PostgreSQL (Row Level Security enforced)" />
          <Setting label="Authentication" value="Supabase Auth (email + password, bcrypt-hashed)" />
          <Setting label="Roles" value="SUPERADMIN · ADMIN · SELLER · CUSTOMER · CITIZEN" />
          <Setting label="Tracking scheme" value="Facility/event-based tracking (PKG-YYYY-NNNNNN)" />
          <Setting label="Notifications" value="In-app notifications generated on every parcel event" />
          <Setting label="Audit logging" value="Enabled (sellers, shipments, profiles, hubs)" />
          <Setting label="Realtime" value="Supabase Realtime (shipments, tracking logs, notifications)" />
        </dl>
      </div>
    </div>
  );
}

function Setting({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 px-4 py-3">
      <dt className="text-[10px] uppercase tracking-wider font-bold text-slate-400">{label}</dt>
      <dd className="font-semibold text-slate-700 dark:text-slate-200 mt-0.5">{value}</dd>
    </div>
  );
}
