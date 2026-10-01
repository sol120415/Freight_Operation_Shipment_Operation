"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PackagePlus, Loader2, CheckCircle2 } from "lucide-react";
import { createBooking } from "./actions";
import { DELIVERY_PLATFORMS } from "@/lib/utils";
import type { DeliveryPlatform } from "@/types";

const INITIAL = {
  clientName: "",
  consignee: "",
  platform: "J&T Express" as DeliveryPlatform,
  destination: "",
  weightKg: 0,
  codAmount: 0,
  serviceType: "Standard",
  trackingNumber: "",
};

const SERVICE_TYPES = ["Standard", "COD", "Next-Day", "Same-Day"];

export default function BookingForm() {
  const router = useRouter();
  const [form, setForm] = useState(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    setSuccess(null);
    const res = await createBooking(form);
    setSubmitting(false);
    if (!res.ok) {
      setSubmitError(res.error ?? "Booking failed");
      return;
    }
    setSuccess(`Parcel ${res.value.reference} intaken at Branch Hub.`);
    setForm(INITIAL);
    router.refresh();
  }

  const canSubmit = form.clientName.trim() && form.consignee.trim() && form.destination.trim();

  const field =
    "w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500";
  const label = "block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1";

  return (
    <form
      onSubmit={submit}
      className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4"
    >
      <div>
        <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
          <PackagePlus className="w-4 h-4 text-pink-500" /> Parcel Intake
        </h4>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
          Pick the partner platform — parcels are routed straight into that
          carrier&apos;s manifest pool.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="md:col-span-2">
          <label className={label}>Seller / client name *</label>
          <input
            className={field}
            required
            value={form.clientName}
            onChange={(e) => set("clientName", e.target.value)}
            placeholder="Jollibee Foods Logistics"
          />
        </div>
        <div className="md:col-span-2">
          <label className={label}>Delivery platform *</label>
          <select
            className={field}
            value={form.platform}
            onChange={(e) => set("platform", e.target.value as DeliveryPlatform)}
          >
            {DELIVERY_PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Recipient / consignee *</label>
          <input
            className={field}
            required
            value={form.consignee}
            onChange={(e) => set("consignee", e.target.value)}
            placeholder="Juan Dela Cruz"
          />
        </div>
        <div>
          <label className={label}>Destination area *</label>
          <input
            className={field}
            required
            value={form.destination}
            onChange={(e) => set("destination", e.target.value)}
            placeholder="Quezon City, NCR"
          />
        </div>
        <div>
          <label className={label}>Weight (kg)</label>
          <input
            type="number"
            min={0}
            step="0.1"
            className={field}
            value={form.weightKg || ""}
            onChange={(e) => set("weightKg", Number(e.target.value))}
          />
        </div>
        <div>
          <label className={label}>COD amount (₱)</label>
          <input
            type="number"
            min={0}
            step="0.01"
            className={field}
            value={form.codAmount || ""}
            onChange={(e) => set("codAmount", Number(e.target.value))}
          />
        </div>
        <div>
          <label className={label}>Service type</label>
          <select
            className={field}
            value={form.serviceType}
            onChange={(e) => set("serviceType", e.target.value)}
          >
            {SERVICE_TYPES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Carrier tracking # (optional)</label>
          <input
            className={field}
            value={form.trackingNumber}
            onChange={(e) => set("trackingNumber", e.target.value)}
            placeholder="JT-2026-XXXXX"
          />
        </div>
      </div>

      {submitError && (
        <p className="text-[11px] text-rose-600 dark:text-rose-400">{submitError}</p>
      )}
      {success && (
        <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
          <CheckCircle2 className="w-3.5 h-3.5" /> {success}
        </p>
      )}

      <button
        type="submit"
        disabled={!canSubmit || submitting}
        className="w-full bg-pink-600 hover:bg-pink-500 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all"
      >
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackagePlus className="w-4 h-4" />}
        {submitting ? "Saving…" : "Intake parcel"}
      </button>
    </form>
  );
}
