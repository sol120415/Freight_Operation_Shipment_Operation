import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { LoadPlan, TrackingLog } from "@/types";
import { DEMO_TRACKING_LOGS } from "@/lib/demoData";
import { isDemoMode } from "@/lib/demoMode";

export const listLoadPlans = cache(
  async (limit = 50): Promise<LoadPlan[]> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("load_plans")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    return data ?? [];
  },
);

export const listTrackingLogs = cache(
  async (shipmentId?: string, limit = 40): Promise<TrackingLog[]> => {
    if (await isDemoMode()) {
      return DEMO_TRACKING_LOGS.filter((log) => !shipmentId || log.shipment_id === shipmentId).slice(0, limit);
    }

    const supabase = await createClient();
    let query = supabase.from("shipment_tracking_logs").select("*");
    if (shipmentId) query = query.eq("shipment_id", shipmentId);
    const { data } = await query
      .order("created_at", { ascending: false })
      .limit(limit);
    return data ?? [];
  },
);
