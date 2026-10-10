"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, PackagePlus, CheckCircle2 } from "lucide-react";
import { DELIVERY_PLATFORMS } from "@/lib/utils";
import { createParcel } from "../actions";

const todayInManila = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Manila",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
import type { Seller } from "@/types";
import { useToast } from "@/components/ui/Toast";

const inputCls =
  "w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-pink-500 transition-all";
const labelCls =
  "block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1";

export default function ParcelForm({
  role,
  sellers,
}: {
  /** AppRole of the signed-in user (server-verified). */
  role: string;
  sellers: Pick<Seller, "id" | "name" | "reference">[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [serviceType, setServiceType] = useState("Standard");
  const [review, setReview] = useState<{
    seller: string;
    consignee: string;
    destination: string;
    platform: string;
    deliveryMethod: string;
    serviceType: string;
    weightKg: number;
    codAmount: number;
  } | null>(null);
  const requestKey = useRef("");
  const [created, setCreated] = useState<{
    trackingNumber: string;
    id: string;
    warning?: string;
  } | null>(null);

  const isSeller = role === "Seller";

  function onSubmit(form: HTMLFormElement) {
    setError(null);
    const formData = new FormData(form);
    const deliveryMethod = String(formData.get("deliveryMethod") ?? "");
    if (deliveryMethod !== "Pickup" && deliveryMethod !== "Drop-off") {
      setError("Please select a delivery method: Pickup or Drop-off.");
      return;
    }
    const payload = {
      idempotencyKey: requestKey.current || (requestKey.current = crypto.randomUUID()),
      sellerId: isSeller ? undefined : String(formData.get("sellerId") ?? "") || undefined,
      customerEmail: String(formData.get("customerEmail") ?? ""),
      consignee: String(formData.get("consignee") ?? ""),
      recipientPhone: String(formData.get("recipientPhone") ?? ""),
      destination: String(formData.get("destination") ?? ""),
      origin: String(formData.get("origin") ?? "Branch Hub"),
      platform: String(formData.get("platform") ?? ""),
      externalTrackingNumber: String(formData.get("externalTrackingNumber") ?? ""),
      deliveryMethod,
      serviceType: String(formData.get("serviceType") ?? "Standard"),
      description: String(formData.get("description") ?? ""),
      dimensions: String(formData.get("dimensions") ?? ""),
      weightKg: Number(formData.get("weightKg") ?? 0) || 0,
      shippingFee: Number(formData.get("shippingFee") ?? 0) || 0,
      codAmount: Number(formData.get("codAmount") ?? 0) || 0,
      expectedDeliveryDate: String(formData.get("expectedDeliveryDate") ?? ""),
    };
    if (!review) {
      const sellerId = String(formData.get("sellerId") ?? "");
      setReview({
        seller: isSeller
          ? "Your seller account"
          : sellers.find((seller) => seller.id === sellerId)?.name ?? "Walk-in / unassigned",
        consignee: payload.consignee,
        destination: payload.destination,
        platform: payload.platform,
        deliveryMethod: payload.deliveryMethod,
        serviceType: payload.serviceType,
        weightKg: payload.weightKg,
        codAmount: payload.codAmount,
      });
      return;
    }
    startTransition(async () => {
      const res = await createParcel(payload);
      if (res.ok && res.value) {
        toast.success(`Parcel ${res.value.trackingNumber} registered`);
        setCreated({
          trackingNumber: res.value.trackingNumber,
          id: res.value.id,
          warning: res.value.warning,
        });
        router.refresh();
      } else if (!res.ok) {
        setError(res.error);
      }
    });
  }

  if (created) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-10 text-center">
        <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
        <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">
          Parcel Registered
        </h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Your parcel is now in the system.
        </p>
        <p className="mt-4 inline-block font-mono text-xl font-black tracking-wider text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-950/40 rounded-xl px-6 py-3">
          {created.trackingNumber}
        </p>
        {created.warning && (
          <p className="mt-4 mx-auto max-w-sm text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-2">
            {created.warning} The parcel was still registered — you can ask an admin to link the recipient later.
          </p>
        )}
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={() => {
              requestKey.current = "";
              setServiceType("Standard");
              setReview(null);
              setCreated(null);
            }}
            className="border border-slate-200 dark:border-slate-700 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
          >
            Register Another
          </button>
          <Link
            href={`/parcels/${created.id}`}
            className="bg-pink-600 hover:bg-pink-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-lg shadow-pink-600/30 transition-all"
          >
            View Tracking
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(e.currentTarget);
      }}
      onChange={() => setReview(null)}
      className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-6 space-y-5"
    >
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {!isSeller && (
          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="sellerId">
              Seller (client sending the parcel)
            </label>
            <select id="sellerId" name="sellerId" className={inputCls} defaultValue="">
              <option value="">Walk-in / unassigned</option>
              {sellers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.reference})
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className={labelCls} htmlFor="consignee">
            Recipient Name *
          </label>
          <input
            id="consignee"
            name="consignee"
            required
            minLength={2}
            maxLength={200}
            className={inputCls}
            placeholder="Juan Dela Cruz"
          />
        </div>

        <div>
          <label className={labelCls} htmlFor="recipientPhone">
            Recipient Phone
          </label>
          <input
            id="recipientPhone"
            name="recipientPhone"
            className={inputCls}
            placeholder="+63 917 000 0000"
          />
        </div>

        <div>
          <label className={labelCls} htmlFor="customerEmail">
            Recipient Account Email
          </label>
          <input
            id="customerEmail"
            name="customerEmail"
            type="email"
            className={inputCls}
            placeholder="customer@email.com (optional)"
          />
          <p className="mt-1 text-[10px] text-slate-400 leading-snug">
            If the recipient has a registered account, they&apos;ll automatically see this parcel and get status notifications.
          </p>
        </div>

        <div>
          <label className={labelCls} htmlFor="destination">
            Destination *
          </label>
          <input
            id="destination"
            name="destination"
            required
            minLength={2}
            className={inputCls}
            placeholder="Quezon City, Metro Manila"
          />
        </div>

        <div>
          <label className={labelCls} htmlFor="platform">
            Delivery Platform *
          </label>
          <select id="platform" name="platform" required className={inputCls}>
            {DELIVERY_PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls} htmlFor="serviceType">
            Service Type
          </label>
          <select
            id="serviceType"
            name="serviceType"
            className={inputCls}
            value={serviceType}
            onChange={(event) => setServiceType(event.target.value)}
          >
            <option>Standard</option>
            <option>COD</option>
            <option>Express</option>
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="externalTrackingNumber">
            External Carrier Tracking Number
          </label>
          <input
            id="externalTrackingNumber"
            name="externalTrackingNumber"
            maxLength={80}
            className={inputCls}
            placeholder="Optional — number supplied by J&T, Lalamove, or another carrier"
          />
          <p className="mt-1 text-[10px] text-slate-400">
            The system creates its own TRK number. Enter this only when an outside carrier already issued one.
          </p>
        </div>

        <fieldset className="sm:col-span-2">
          <legend className={labelCls}>Delivery Method *</legend>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer transition-all has-checked:border-pink-500 has-checked:bg-pink-50 dark:has-checked:bg-pink-950/40 has-checked:text-pink-700 dark:has-checked:text-pink-300">
              <input type="radio" name="deliveryMethod" value="Pickup" required className="accent-pink-600 w-4 h-4" />
              Pickup
              <span className="font-normal text-slate-400">— rider collects</span>
            </label>
            <label className="flex items-center gap-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer transition-all has-checked:border-pink-500 has-checked:bg-pink-50 dark:has-checked:bg-pink-950/40 has-checked:text-pink-700 dark:has-checked:text-pink-300">
              <input type="radio" name="deliveryMethod" value="Drop-off" required className="accent-pink-600 w-4 h-4" />
              Drop-off
              <span className="font-normal text-slate-400">— at the center</span>
            </label>
          </div>
        </fieldset>

        <div>
          <label className={labelCls} htmlFor="expectedDeliveryDate">
            Expected Delivery
          </label>
          <input
            id="expectedDeliveryDate"
            name="expectedDeliveryDate"
            type="date"
            min={todayInManila}
            className={inputCls}
          />
        </div>
      </section>

      {serviceType === "COD" && (
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/70 dark:bg-amber-950/20 p-4">
          <div>
            <label className={labelCls} htmlFor="codAmount">
              COD Amount (₱) *
            </label>
            <input
              id="codAmount"
              name="codAmount"
              type="number"
              min="0.01"
              step="0.01"
              required
              className={inputCls}
              placeholder="0.00"
            />
          </div>
          <p className="self-end pb-2 text-[11px] text-amber-700 dark:text-amber-300">
            Required for COD parcels so collection and remittance records stay accurate.
          </p>
        </section>
      )}

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
        <div>
          <label className={labelCls} htmlFor="weightKg">
            Weight (kg)
          </label>
          <input
            id="weightKg"
            name="weightKg"
            type="number"
            min="0"
            step="0.01"
            defaultValue="0"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="dimensions">
            Dimensions (L×W×H cm)
          </label>
          <input
            id="dimensions"
            name="dimensions"
            className={inputCls}
            placeholder="30×20×10"
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="shippingFee">
            Shipping Fee (₱)
          </label>
          <input
            id="shippingFee"
            name="shippingFee"
            type="number"
            min="0"
            step="0.01"
            defaultValue="0"
            className={inputCls}
          />
        </div>
      </section>

      <section>
        <label className={labelCls} htmlFor="description">
          Parcel Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={2}
          maxLength={500}
          className={inputCls}
          placeholder="e.g. 2 pairs of shoes, fragile"
        />
      </section>

      {error && (
        <p className="text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {review && (
        <div className="rounded-xl border border-pink-200 bg-pink-50/70 p-4 text-xs dark:border-pink-900 dark:bg-pink-950/30">
          <p className="font-bold text-slate-900 dark:text-slate-100">Review before saving</p>
          <dl className="mt-2 grid grid-cols-1 gap-1 text-slate-600 dark:text-slate-300 sm:grid-cols-2">
            <div><dt className="inline font-semibold">Seller: </dt><dd className="inline">{review.seller}</dd></div>
            <div><dt className="inline font-semibold">Platform: </dt><dd className="inline">{review.platform}</dd></div>
            <div><dt className="inline font-semibold">Recipient: </dt><dd className="inline">{review.consignee}</dd></div>
            <div><dt className="inline font-semibold">Destination: </dt><dd className="inline">{review.destination}</dd></div>
            <div><dt className="inline font-semibold">Delivery: </dt><dd className="inline">{review.deliveryMethod}</dd></div>
            <div><dt className="inline font-semibold">Service: </dt><dd className="inline">{review.serviceType}</dd></div>
            <div><dt className="inline font-semibold">Weight: </dt><dd className="inline">{review.weightKg.toFixed(2)} kg</dd></div>
            {review.serviceType === "COD" && (
              <div><dt className="inline font-semibold">COD: </dt><dd className="inline">₱{review.codAmount.toFixed(2)}</dd></div>
            )}
          </dl>
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-2">
        {review && (
          <button
            type="button"
            onClick={() => setReview(null)}
            disabled={pending}
            className="px-4 py-2.5 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700"
          >
            Back
          </button>
        )}
        <Link
          href="/parcels"
          className="px-4 py-2.5 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 bg-pink-600 hover:bg-pink-500 disabled:opacity-60 text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-lg shadow-pink-600/30 transition-all active:scale-95"
        >
          {pending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <PackagePlus className="w-4 h-4" />
          )}
          {pending ? "Saving…" : review ? "Confirm Registration" : "Review Parcel"}
        </button>
      </div>
    </form>
  );
}

