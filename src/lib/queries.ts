import { createClient } from "@/lib/supabase/server";
import type { Shipment, CarrierBatch, Handover } from "@/types";
import {
  DEMO_BATCHES,
  DEMO_HANDOVERS,
  DEMO_SHIPMENTS,
} from "@/lib/demoData";
import { isDemoMode } from "@/lib/demoMode";

export { computeHubStats, monthlyIntakeVolume } from "@/lib/stats";
export type { IntakeRow } from "@/lib/stats";

/** Fetch all parcels visible to the current user (RLS-scoped). */
export async function getShipments(): Promise<Shipment[]> {
  if (await isDemoMode()) return DEMO_SHIPMENTS;

  const supabase = await createClient();
  const { data } = await supabase
    .from("shipments")
    .select("*")
    .order("created_at", { ascending: false });
  return data ?? [];
}

/**
 * Hub dashboard roll-up: live batches and recent handovers, counted in one
 * parallel pass server-side.
 */
export async function getHubDashboard() {
  if (await isDemoMode()) {
    return {
      shipments: DEMO_SHIPMENTS,
      batches: DEMO_BATCHES,
      handovers: DEMO_HANDOVERS,
    };
  }

  const supabase = await createClient();
  const [recentShipments, batches, handovers] = await Promise.all([
    supabase.from("shipments").select("*").limit(200),
    supabase
      .from("carrier_batches")
      .select("*")
      .not("status", "eq", "Handed Over")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("handovers")
      .select("*")
      .order("handed_over_at", { ascending: false })
      .limit(10),
  ]);

  const shipments = (recentShipments.data ?? []) as Shipment[];
  return {
    shipments,
    batches: (batches.data ?? []) as CarrierBatch[],
    handovers: (handovers.data ?? []) as Handover[],
  };
}
