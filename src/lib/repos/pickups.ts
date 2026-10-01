import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { PickupRequest, PickupRequestWithSeller, PickupStatus } from "@/types";

/** Pickup requests joined with their seller, newest first. */
export const listPickups = cache(
  async (opts: { status?: PickupStatus } = {}): Promise<PickupRequestWithSeller[]> => {
    const supabase = await createClient();
    let query = supabase.from("pickup_requests").select("*, seller:sellers(id, name, phone)");
    if (opts.status) query = query.eq("status", opts.status as PickupStatus);
    const { data, error } = await query.order("scheduled_at", { ascending: false });
    if (error) throw new Error(`Could not load pickup requests: ${error.message}`);
    return (data ?? []) as unknown as PickupRequestWithSeller[];
  },
);

export const getPickupById = cache(
  async (id: string): Promise<PickupRequest | null> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("pickup_requests")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    return (data as PickupRequest) ?? null;
  },
);
