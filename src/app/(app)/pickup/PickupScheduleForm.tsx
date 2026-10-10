"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Loader2, CheckCircle2 } from "lucide-react";
import { createPickup } from "./actions";
import type { SellerWithStats } from "@/types";

export default function PickupScheduleForm({
  sellers,
}: {
  sellers: SellerWithStats[];
}) {
  const router = useRouter();
  const [sellerId, setSellerId] = useState(sellers[0]?.id ?? "");
  const [scheduledAt, setScheduledAt] = useState("");
  const [expectedParcelCount, setExpectedParcelCount] = useState(0);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const requestKey = useRef("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    if (!requestKey.current) requestKey.current = crypto.randomUUID();
    const res = await createPickup({
      sellerId,
      idempotencyKey: requestKey.current,
      scheduledAt: new Date(scheduledAt).toISOString(),
      expectedParcelCount,
      notes,
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error ?? "Failed to schedule pickup");
      return;
    }
    setSuccess(`Pickup ${res.value.reference} scheduled.`);
    requestKey.current = "";
    setScheduledAt("");
    setExpectedParcelCount(0);
    setNotes("");
    router.refresh();
  }

  const field =
    "w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500";
  const label = "block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1";

  if (sellers.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm text-[11px] text-slate-500 dark:text-slate-400">
        Register a seller first to schedule pickups.
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3"
    >
      <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
        <CalendarClock className="w-4 h-4 text-pink-500" /> Schedule Pickup
      </h4>
      <div>
        <label className={label}>Seller</label>
        <select className={field} value={sellerId} onChange={(e) => setSellerId(e.target.value)}>
          {sellers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} — {s.parcelCount} parcels
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={label}>Schedule *</label>
          <input
            type="datetime-local"
            required
            className={field}
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
          />
        </div>
        <div>
          <label className={label}>Expected parcels</label>
          <input
            type="number"
            min={0}
            className={field}
            value={expectedParcelCount || ""}
            onChange={(e) => setExpectedParcelCount(Number(e.target.value))}
          />
        </div>
      </div>
      <div>
        <label className={label}>Notes</label>
        <input className={field} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      {error && <p className="text-[11px] text-rose-600 dark:text-rose-400">{error}</p>}
      {success && (
        <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
          <CheckCircle2 className="w-3.5 h-3.5" /> {success}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting || !scheduledAt}
        className="w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all"
      >
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarClock className="w-4 h-4" />}
        {submitting ? "Saving…" : "Schedule pickup"}
      </button>
    </form>
  );
}
