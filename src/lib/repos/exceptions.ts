import { createClient } from "@/lib/supabase/server";
import { manilaDateISO } from "@/lib/utils";
import type { DeliveryPlatform, ShipmentStatus } from "@/types";

const EXCEPTION_STATUSES = new Set<ShipmentStatus>([
  "Pickup Failed",
  "Delivery Failed",
  "Damaged",
  "Lost",
  "Returned",
  "Delayed",
  "Customs Hold",
]);

const TERMINAL = new Set<ShipmentStatus>(["Delivered", "Cancelled", "Archived", "Returned", "Lost"]);

export interface OperationalException {
  parcelId: string;
  trackingNumber: string;
  reference: string;
  sellerName: string;
  destination: string;
  status: ShipmentStatus;
  updatedAt: string;
  expectedDeliveryDate: string | null;
  issues: string[];
  severity: "critical" | "warning";
}

export interface PendingHandover {
  id: string;
  reference: string;
  platform: DeliveryPlatform;
  parcelCount: number;
  updatedAt: string;
  waitingHours: number;
}

export async function getOperationalExceptions(): Promise<{
  parcels: OperationalException[];
  handovers: PendingHandover[];
}> {
  const supabase = await createClient();
  const [{ data: parcelRows, error: parcelError }, { data: batchRows, error: batchError }] =
    await Promise.all([
      supabase
        .from("shipments")
        .select("id, tracking_number, reference, destination, status, updated_at, expected_delivery_date, seller:sellers(name)")
        .is("archived_at", null)
        .order("updated_at", { ascending: true })
        .limit(300),
      supabase
        .from("carrier_batches")
        .select("id, reference, platform, parcel_count, updated_at")
        .eq("status", "Ready")
        .order("updated_at", { ascending: true })
        .limit(100),
    ]);

  if (parcelError) throw new Error(parcelError.message);
  if (batchError) throw new Error(batchError.message);

  const now = Date.now();
  const today = manilaDateISO();
  const parcels: OperationalException[] = [];

  for (const row of parcelRows ?? []) {
    const status = row.status as ShipmentStatus;
    if (TERMINAL.has(status) && !EXCEPTION_STATUSES.has(status)) continue;

    const issues: string[] = [];
    if (EXCEPTION_STATUSES.has(status)) issues.push(status);
    if (row.expected_delivery_date && row.expected_delivery_date < today) {
      issues.push("Past expected delivery date");
    }
    const idleHours = Math.floor((now - new Date(row.updated_at).getTime()) / 3_600_000);
    if (!TERMINAL.has(status) && idleHours >= 24) {
      issues.push(`No verified update for ${idleHours} hours`);
    }
    if (!issues.length) continue;

    const seller = row.seller as unknown as { name?: string } | null;
    parcels.push({
      parcelId: row.id,
      trackingNumber: row.tracking_number ?? row.reference,
      reference: row.reference,
      sellerName: seller?.name ?? "Walk-in / unassigned",
      destination: row.destination,
      status,
      updatedAt: row.updated_at,
      expectedDeliveryDate: row.expected_delivery_date,
      issues,
      severity: ["Lost", "Damaged", "Delivery Failed", "Pickup Failed"].includes(status) || idleHours >= 72
        ? "critical"
        : "warning",
    });
  }

  const handovers: PendingHandover[] = (batchRows ?? []).map((row) => ({
    id: row.id,
    reference: row.reference,
    platform: row.platform,
    parcelCount: row.parcel_count,
    updatedAt: row.updated_at,
    waitingHours: Math.max(0, Math.floor((now - new Date(row.updated_at).getTime()) / 3_600_000)),
  }));

  parcels.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
    return a.updatedAt.localeCompare(b.updatedAt);
  });
  return { parcels, handovers };
}
