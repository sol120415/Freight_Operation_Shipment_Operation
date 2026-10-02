import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Shipment } from "@/types";
import { DEMO_SHIPMENTS } from "@/lib/demoData";
import { isDemoMode } from "@/lib/demoMode";

export interface ShipmentQuery {
  q?: string;
  status?: string;
  platform?: string;
  includeArchived?: boolean;
  page?: number;
  perPage?: number;
}

export interface Paged<T> {
  rows: T[];
  total: number;
  page: number;
  perPage: number;
}

/**
 * Paginated, searchable parcel listing (Batched → Intake → history).
 * Archived parcels are hidden unless explicitly requested.
 * RLS-scoped to the caller; memoized per request via React `cache()`.
 */
export const listShipments = cache(
  async (opts: ShipmentQuery = {}): Promise<Paged<Shipment>> => {
    const page = Math.max(1, opts.page ?? 1);
    const perPage = Math.min(100, Math.max(1, opts.perPage ?? 25));
    const from = (page - 1) * perPage;

    if (await isDemoMode()) {
      const term = opts.q?.trim().toLowerCase();
      const filtered = DEMO_SHIPMENTS.filter((shipment) => {
        if (opts.status && shipment.status !== opts.status) return false;
        if (opts.platform && shipment.platform !== opts.platform) return false;
        if (!term) return true;
        return [
          shipment.reference,
          shipment.tracking_number,
          shipment.client_name,
          shipment.consignee,
        ].some((value) => value?.toLowerCase().includes(term));
      });
      return {
        rows: filtered.slice(from, from + perPage),
        total: filtered.length,
        page,
        perPage,
      };
    }

    const supabase = await createClient();

    let query = supabase.from("shipments").select("*", { count: "exact" });
    if (!opts.includeArchived) query = query.is("archived_at", null);
    if (opts.status) query = query.eq("status", opts.status as Shipment["status"]);
    if (opts.platform) {
      query = query.eq("platform", opts.platform as Shipment["platform"]);
    }
    if (opts.q && opts.q.trim()) {
      const q = opts.q.trim();
      query = query.or(
        `reference.ilike.%${q}%,tracking_number.ilike.%${q}%,client_name.ilike.%${q}%,consignee.ilike.%${q}%`,
      );
    }
    const { data, count } = await query
      .order("created_at", { ascending: false })
      .range(from, from + perPage - 1);

    return { rows: (data ?? []) as Shipment[], total: count ?? 0, page, perPage };
  },
);

/** Unbounded-ish recent set for the dashboard KPI/chart roll-ups. */
export const listRecentShipments = cache(
  async (limit = 200): Promise<Shipment[]> => {
    if (await isDemoMode()) return DEMO_SHIPMENTS.slice(0, limit);

    const supabase = await createClient();
    const { data } = await supabase
      .from("shipments")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    return (data ?? []) as Shipment[];
  },
);

/** Shipment slice used by the BoL generator (no heavy columns). */
export const listShipmentsForBol = cache(
  async (): Promise<
    Pick<
      Shipment,
      | "id"
      | "reference"
      | "shipper"
      | "consignee"
      | "origin"
      | "destination"
      | "container_no"
      | "weight_kg"
      | "volume_cbm"
  >[]
  > => {
    if (await isDemoMode()) {
      return DEMO_SHIPMENTS.map((shipment) => ({
        id: shipment.id,
        reference: shipment.reference,
        shipper: shipment.shipper,
        consignee: shipment.consignee,
        origin: shipment.origin,
        destination: shipment.destination,
        container_no: shipment.container_no,
        weight_kg: shipment.weight_kg,
        volume_cbm: shipment.volume_cbm,
      }));
    }

    const supabase = await createClient();
    const { data } = await supabase
      .from("shipments")
      .select(
        "id, reference, shipper, consignee, origin, destination, container_no, weight_kg, volume_cbm",
      )
      .order("created_at", { ascending: false });
    return data ?? [];
  },
);

export const getShipmentById = cache(async (id: string): Promise<Shipment | null> => {
  if (await isDemoMode()) {
    return DEMO_SHIPMENTS.find((shipment) => shipment.id === id) ?? null;
  }

  const supabase = await createClient();
  const { data } = await supabase.from("shipments").select("*").eq("id", id).maybeSingle();
  return (data as Shipment) ?? null;
});
