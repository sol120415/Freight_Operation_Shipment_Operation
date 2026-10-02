import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Shipment, ShipmentStatus, TrackingLog, Hub, Seller } from "@/types";
import { DEMO_SHIPMENTS, DEMO_TRACKING_LOGS } from "@/lib/demoData";
import { isDemoMode } from "@/lib/demoMode";

export interface ParcelRow extends Shipment {
  sellerName: string | null;
  sellerReference: string | null;
  hubName: string | null;
}

export interface ListParcelsOptions {
  /** Free-text search over tracking #, reference, recipient, client name. */
  q?: string;
  status?: string;
  sellerId?: string;
  customerId?: string;
  hubId?: string;
  page?: number;
  pageSize?: number;
  sort?: "created_desc" | "created_asc" | "updated_desc";
}

export interface ParcelListResult {
  rows: ParcelRow[];
  total: number;
  page: number;
  pageSize: number;
}

const PAGE_SIZE = 20;

function toDemoParcelRow(shipment: Shipment): ParcelRow {
  return {
    ...shipment,
    sellerName: shipment.seller_id ? "Airship Demo Seller" : null,
    sellerReference: shipment.seller_id ? "SELL-DEMO-0001" : null,
    hubName: shipment.current_location,
  };
}

/**
 * Paginated, filterable parcel listing.
 * Visibility is enforced twice: RLS scopes rows to the caller's role, and the
 * server action layer narrows further (e.g. a sellerId param) for staff views.
 */
export async function listParcels(
  opts: ListParcelsOptions = {},
): Promise<ParcelListResult> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? PAGE_SIZE));

  if (await isDemoMode()) {
    const term = opts.q?.trim().toLowerCase();
    const filtered = DEMO_SHIPMENTS.filter((shipment) => {
      if (opts.status && shipment.status !== opts.status) return false;
      if (opts.sellerId && shipment.seller_id !== opts.sellerId) return false;
      if (opts.customerId && shipment.client_id !== opts.customerId) return false;
      if (opts.hubId && shipment.current_hub_id !== opts.hubId) return false;
      if (!term) return true;
      return [
        shipment.tracking_number,
        shipment.reference,
        shipment.consignee,
        shipment.client_name,
      ].some((value) => value?.toLowerCase().includes(term));
    })
      .sort((a, b) => {
        if (opts.sort === "created_asc") return a.created_at.localeCompare(b.created_at);
        if (opts.sort === "updated_desc") return b.updated_at.localeCompare(a.updated_at);
        return b.created_at.localeCompare(a.created_at);
      })
      .map(toDemoParcelRow);
    const from = (page - 1) * pageSize;
    return {
      rows: filtered.slice(from, from + pageSize),
      total: filtered.length,
      page,
      pageSize,
    };
  }

  const supabase = await createClient();

  let query = supabase
    .from("shipments")
    .select(
      "*, seller:sellers(id, name, reference), hub:hubs(id, name)",
      { count: "exact" },
    )
    .range((page - 1) * pageSize, page * pageSize - 1);

  switch (opts.sort) {
    case "created_asc":
      query = query.order("created_at", { ascending: true });
      break;
    case "updated_desc":
      query = query.order("updated_at", { ascending: false });
      break;
    default:
      query = query.order("created_at", { ascending: false });
  }

  if (opts.q) {
    const term = `%${opts.q.replace(/[%_]/g, "")}%`;
    query = query.or(
      `tracking_number.ilike.${term},reference.ilike.${term},consignee.ilike.${term},client_name.ilike.${term}`,
    );
  }
  if (opts.status) query = query.eq("status", opts.status as ShipmentStatus);
  if (opts.sellerId) query = query.eq("seller_id", opts.sellerId);
  if (opts.customerId) query = query.eq("client_id", opts.customerId);
  if (opts.hubId) query = query.eq("current_hub_id", opts.hubId);

  const { data, count } = await query;

  const rows: ParcelRow[] = ((data ?? []) as unknown as (Shipment & {
    seller: Pick<Seller, "id" | "name" | "reference"> | null;
    hub: Pick<Hub, "id" | "name"> | null;
  })[]).map((s) => ({
    ...s,
    sellerName: s.seller?.name ?? null,
    sellerReference: s.seller?.reference ?? null,
    hubName: s.hub?.name ?? s.current_location ?? null,
  }));

  return { rows, total: count ?? 0, page, pageSize };
}

/** Single parcel with joined context. Returns null when RLS hides the row. */
export const getParcelById = cache(
  async (id: string): Promise<ParcelRow | null> => {
    if (await isDemoMode()) {
      const shipment = DEMO_SHIPMENTS.find((item) => item.id === id);
      return shipment ? toDemoParcelRow(shipment) : null;
    }

    const supabase = await createClient();
    const { data } = await supabase
      .from("shipments")
      .select("*, seller:sellers(id, name, reference, email, phone, address), hub:hubs(id, name)")
      .eq("id", id)
      .maybeSingle();
    if (!data) return null;
    const row = data as unknown as Shipment & {
      seller: (Pick<Seller, "id" | "name" | "reference"> & {
        email: string | null;
        phone: string | null;
        address: string | null;
      }) | null;
      hub: Pick<Hub, "id" | "name"> | null;
    };
    return {
      ...row,
      sellerName: row.seller?.name ?? null,
      sellerReference: row.seller?.reference ?? null,
      hubName: row.hub?.name ?? row.current_location ?? null,
    };
  },
);

/** Tracking timeline events for one parcel (RLS-scoped). */
export async function getTrackingTimeline(
  parcelId: string,
): Promise<TrackingLog[]> {
  if (await isDemoMode()) {
    return DEMO_TRACKING_LOGS.filter((log) => log.shipment_id === parcelId);
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("shipment_tracking_logs")
    .select("*")
    .eq("shipment_id", parcelId)
    .order("created_at", { ascending: true });
  return (data ?? []) as TrackingLog[];
}

/** Look up a parcel by its public tracking number (RLS-scoped). */
export async function getParcelByTrackingNumber(
  trackingNumber: string,
): Promise<ParcelRow | null> {
  if (await isDemoMode()) {
    const normalized = trackingNumber.trim().toLowerCase();
    const shipment = DEMO_SHIPMENTS.find(
      (item) => item.tracking_number?.toLowerCase() === normalized,
    );
    return shipment ? toDemoParcelRow(shipment) : null;
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("shipments")
    .select("*, seller:sellers(id, name, reference), hub:hubs(id, name)")
    .ilike("tracking_number", trackingNumber.trim())
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as Shipment & {
    seller: Pick<Seller, "id" | "name" | "reference"> | null;
    hub: Pick<Hub, "id" | "name"> | null;
  };
  return {
    ...row,
    sellerName: row.seller?.name ?? null,
    sellerReference: row.seller?.reference ?? null,
    hubName: row.hub?.name ?? row.current_location ?? null,
  };
}
