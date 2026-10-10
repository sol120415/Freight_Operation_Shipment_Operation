"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ScanLine, Loader2, CheckCircle2 } from "lucide-react";
import { quickIntake } from "./actions";
import { DELIVERY_PLATFORMS } from "@/lib/utils";
import type { DeliveryPlatform, SellerWithStats } from "@/types";

const INITIAL = {
  externalTrackingNumber: "",
  consignee: "",
  destination: "Metro Manila",
  platform: "J&T Express" as DeliveryPlatform,
  weightKg: 0,
  codAmount: 0,
  serviceType: "Standard" as "Standard" | "COD",
};

export default function QuickIntake({
  sellers,
}: {
  sellers: SellerWithStats[];
}) {
  const router = useRouter();
  const [sellerId, setSellerId] = useState(sellers[0]?.id ?? "");
  const [form, setForm] = useState(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const requestKey = useRef("");

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    if (!requestKey.current) requestKey.current = crypto.randomUUID();
    const res = await quickIntake({
      ...form,
      sellerId: sellerId || null,
      idempotencyKey: requestKey.current,
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error ?? "Intake failed");
      return;
    }
    setSuccess(`Parcel ${res.value.reference} intaken.`);
    requestKey.current = "";
    setForm(INITIAL);
    router.refresh();
  }

  const field =
    "w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500";
  const label = "block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1";

  return (
    <form
      onSubmit={submit}
      className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3"
    >
      <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
        <ScanLine className="w-4 h-4 text-pink-500" /> Quick Intake Counter
      </h4>
      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        Enter the parcel details. The internal parcel and tracking numbers are
        generated automatically after saving.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className={label}>Platform</label>
          <select className={field} value={form.platform} onChange={(e) => set("platform", e.target.value as DeliveryPlatform)}>
            {DELIVERY_PLATFORMS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Seller (optional)</label>
          <select className={field} value={sellerId} onChange={(e) => setSellerId(e.target.value)}>
            <option value="">Walk-in / unassigned</option>
            {sellers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Recipient</label>
          <input className={field} value={form.consignee} onChange={(e) => set("consignee", e.target.value)} />
        </div>
        <div>
          <label className={label}>Destination</label>
          <input className={field} value={form.destination} onChange={(e) => set("destination", e.target.value)} />
        </div>
        <div>
          <label className={label}>Carrier tracking # (optional)</label>
          <input className={field} value={form.externalTrackingNumber} onChange={(e) => set("externalTrackingNumber", e.target.value)} />
        </div>
        <div>
          <label className={label}>Weight (kg)</label>
          <input type="number" min={0} step="0.1" className={field} value={form.weightKg || ""} onChange={(e) => set("weightKg", Number(e.target.value))} />
        </div>
        <div>
          <label className={label}>Service type</label>
          <select className={field} value={form.serviceType} onChange={(e) => set("serviceType", e.target.value as "Standard" | "COD")}>
            <option value="Standard">Standard</option>
            <option value="COD">COD</option>
          </select>
        </div>
        {form.serviceType === "COD" && (
          <div>
            <label className={label}>COD amount (₱) *</label>
            <input type="number" min={0.01} step="0.01" required className={field} value={form.codAmount || ""} onChange={(e) => set("codAmount", Number(e.target.value))} />
          </div>
        )}
      </div>
      {error && <p className="text-[11px] text-rose-600 dark:text-rose-400">{error}</p>}
      {success && (
        <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
          <CheckCircle2 className="w-3.5 h-3.5" /> {success}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting || !form.destination.trim()}
        className="w-full bg-pink-600 hover:bg-pink-500 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all"
      >
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanLine className="w-4 h-4" />}
        {submitting ? "Saving…" : "Intake parcel"}
      </button>
    </form>
  );
}
