import type {
  ShipmentStatus,
  TransportMode,
  DeliveryPlatform,
  BatchStatus,
  PickupStatus,
} from "@/types";
import { DEFAULT_CURRENCY } from "@/lib/locale";

/**
 * All date/currency formatting is pinned to an explicit locale AND timezone
 * so server-rendered HTML always matches the client render exactly
 * (prevents React hydration mismatches across environments).
 */
const LOCALE = "en-US";
const TIME_ZONE = "Asia/Manila";

/** Calendar date in the Philippine timezone, safe around UTC midnight. */
export function manilaDateISO(value: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

/** Format money; defaults to Philippine pesos (₱). Treats legacy USD as PHP. */
export function formatCurrency(
  amount: number,
  currency: string = DEFAULT_CURRENCY,
): string {
  const code = !currency || currency.toUpperCase() === "USD" ? DEFAULT_CURRENCY : currency;
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: code,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat(LOCALE).format(n);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(LOCALE, {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: TIME_ZONE,
      });
}

/** e.g. "August 22, 2026 — 10:45 AM" */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const date = d.toLocaleDateString(LOCALE, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: TIME_ZONE,
  });
  const time = d.toLocaleTimeString(LOCALE, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  });
  return `${date} — ${time}`;
}

/** Tailwind classes for a status badge. */
export function statusBadgeClass(status: ShipmentStatus | string): string {
  switch (status) {
    case "Registered":
    case "Booked":
      return "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300";
    case "In Transit":
      return "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300";
    case "Pickup Scheduled":
    case "Picked Up":
    case "Dropped Off":
    case "Intake":
      return "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300";
    case "At Origin Hub":
    case "At Destination Hub":
    case "Batched":
      return "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300";
    case "Out for Delivery":
    case "Handed Over":
      return "bg-teal-100 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300";
    case "Customs Hold":
    case "Draft":
      return "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300";
    case "Delivered":
    case "Approved":
    case "Received":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300";
    case "Delivery Failed":
    case "Pickup Failed":
    case "Damaged":
    case "Lost":
    case "Delayed":
    case "Rejected":
    case "No Show":
      return "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300";
    case "Returned":
      return "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300";
    case "Cancelled":
    case "Archived":
      return "bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400";
    default:
      return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
  }
}

export const TRANSPORT_MODES: TransportMode[] = ["Ocean", "Air", "Road", "Rail"];

/** Supported partner courier / e-commerce platforms. */
export const DELIVERY_PLATFORMS: DeliveryPlatform[] = [
  "J&T Express",
  "Flash Express",
  "LBC Express",
  "GoGo Xpress",
  "Shopee Drop-Off",
  "Lazada Drop-Off",
  "TikTok Shop Drop-Off",
  "Custom Partner",
];

/** Parcel lifecycle at the hub (terminal on carrier handover). */
export const PARCEL_STATUSES: ShipmentStatus[] = [
  "Intake",
  "Batched",
  "Handed Over",
  "Cancelled",
  "Archived",
];

export const BATCH_STATUSES: BatchStatus[] = ["Draft", "Ready", "Handed Over"];

export const PICKUP_STATUSES: PickupStatus[] = [
  "Scheduled",
  "In Transit",
  "Received",
  "No Show",
  "Cancelled",
];
