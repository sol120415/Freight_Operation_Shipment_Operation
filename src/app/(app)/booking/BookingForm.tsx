"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PackagePlus, Loader2, CheckCircle2 } from "lucide-react";
import { createBooking } from "./actions";
import { DELIVERY_PLATFORMS } from "@/lib/utils";
import type { DeliveryPlatform, Seller } from "@/types";

const INITIAL = {
  sellerId: "",
  consignee: "",
  platform: "J&T Express" as DeliveryPlatform,
  destination: "",
  weightKg: 0,
  codAmount: 0,
  serviceType: "Standard",
  externalTrackingNumber: "",
};

const SERVICE_TYPES = ["Standard", "COD", "Next-Day", "Same-Day"];

export default function BookingForm({
  sellers,
}: {
  sellers: Pick<Seller, "id" | "name" | "reference" | "email" | "phone">[];
}) {
  const router = useRouter();
  const [form, setForm] = useState({ ...INITIAL, sellerId: sellers[0]?.id ?? "" });
  const [sellerSearch, setSellerSearch] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const requestKey = useRef("");

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setReviewing(false);
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reviewing) {
      setReviewing(true);
      setSubmitError(null);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    setSuccess(null);
    if (!requestKey.current) requestKey.current = crypto.randomUUID();
    const res = await createBooking({ ...form, idempotencyKey: requestKey.current });
    setSubmitting(false);
    if (!res.ok) {
      setSubmitError(res.error ?? "Booking failed");
      return;
    }
    setSuccess(`Booking ${res.value.reference} created.`);
    requestKey.current = "";
    setReviewing(false);
    setForm({ ...INITIAL, sellerId: sellers[0]?.id ?? "" });
    router.refresh();
  }

  const canSubmit =
    form.sellerId &&
    form.consignee.trim() &&
    form.destination.trim() &&
    (form.serviceType !== "COD" || form.codAmount > 0);
  const filteredSellers = sellers.filter((seller) =>
    `${seller.name} ${seller.reference} ${seller.email ?? ""}`
      .toLowerCase()
      .includes(sellerSearch.trim().toLowerCase()),
  );
  const selectedSeller = sellers.find((seller) => seller.id === form.sellerId);

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
          <PackagePlus className="w-4 h-4 text-pink-500" /> Parcel Booking
        </h4>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
          Select the seller and enter only shipment-specific details. Internal
          references are assigned after saving.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="md:col-span-2">
          <label className={label}>Find seller</label>
          <input
            className={field}
            value={sellerSearch}
            onChange={(e) => setSellerSearch(e.target.value)}
            placeholder="Search by seller name, reference, or email"
          />
        </div>
        <div className="md:col-span-2">
          <label className={label}>Seller *</label>
          <select
            required
            className={field}
            value={form.sellerId}
            onChange={(e) => set("sellerId", e.target.value)}
          >
            <option value="">Select a seller</option>
            {filteredSellers.map((seller) => (
              <option key={seller.id} value={seller.id}>
                {seller.name} ({seller.reference})
              </option>
            ))}
          </select>
          {selectedSeller && (
            <p className="mt-1 text-[11px] text-slate-400">
              {[selectedSeller.email, selectedSeller.phone].filter(Boolean).join(" · ") || "No contact details saved"}
            </p>
          )}
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
        {form.serviceType === "COD" && (
          <div>
            <label className={label}>COD amount (₱) *</label>
            <input
              type="number"
              min={0.01}
              step="0.01"
              required
              className={field}
              value={form.codAmount || ""}
              onChange={(e) => set("codAmount", Number(e.target.value))}
            />
          </div>
        )}
        <div>
          <label className={label}>Carrier tracking # (optional)</label>
          <input
            className={field}
            value={form.externalTrackingNumber}
            onChange={(e) => set("externalTrackingNumber", e.target.value)}
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

      {reviewing && (
        <div className="rounded-xl border border-pink-200 bg-pink-50/70 p-4 text-xs dark:border-pink-900 dark:bg-pink-950/30">
          <p className="font-bold text-slate-900 dark:text-slate-100">Review before saving</p>
          <dl className="mt-2 grid grid-cols-1 gap-1 text-slate-600 dark:text-slate-300 sm:grid-cols-2">
            <div><dt className="inline font-semibold">Seller: </dt><dd className="inline">{selectedSeller?.name}</dd></div>
            <div><dt className="inline font-semibold">Platform: </dt><dd className="inline">{form.platform}</dd></div>
            <div><dt className="inline font-semibold">Recipient: </dt><dd className="inline">{form.consignee}</dd></div>
            <div><dt className="inline font-semibold">Destination: </dt><dd className="inline">{form.destination}</dd></div>
            <div><dt className="inline font-semibold">Service: </dt><dd className="inline">{form.serviceType}</dd></div>
            <div><dt className="inline font-semibold">Weight: </dt><dd className="inline">{form.weightKg.toFixed(2)} kg</dd></div>
            {form.serviceType === "COD" && (
              <div><dt className="inline font-semibold">COD: </dt><dd className="inline">₱{form.codAmount.toFixed(2)}</dd></div>
            )}
          </dl>
        </div>
      )}

      <div className="flex gap-2">
        {reviewing && (
          <button
            type="button"
            onClick={() => setReviewing(false)}
            disabled={submitting}
            className="border border-slate-200 dark:border-slate-700 px-4 py-2.5 rounded-xl text-xs font-bold"
          >
            Back
          </button>
        )}
        <button
          type="submit"
          disabled={!canSubmit || submitting}
          className="flex-1 bg-pink-600 hover:bg-pink-500 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackagePlus className="w-4 h-4" />}
          {submitting ? "Saving…" : reviewing ? "Confirm booking" : "Review booking"}
        </button>
      </div>
    </form>
  );
}
