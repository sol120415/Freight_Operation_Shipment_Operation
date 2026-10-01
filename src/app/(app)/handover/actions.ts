"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole, canFinalizeHandover } from "@/lib/auth";
import { runAction, ok, fail, type ActionResult } from "@/lib/actions/result";
import { handoverSchema } from "@/lib/validation/schemas";
import { serverLog } from "@/lib/server/log";

/**
 * Finalize handover: a Rider signs for a Ready batch, parcels flip to
 * "Handed Over" and a handover record is written for history/audit.
 *
 * Parcel status changes go through the `update_parcel_status` RPC so each
 * parcel gets a tracking event AND its seller receives the handover
 * notification ("Your parcel [tracking] has been successfully handed over
 * to our delivery partner.") atomically — notifications reach only the
 * sellers that own the handed-over parcels.
 */
export async function signHandover(
  input: unknown,
): Promise<ActionResult<{ batchId: string }>> {
  return runAction("handover.signHandover", handoverSchema, input, async (form) => {
    const profile = await requireRole(["SuperAdmin", "Admin"]);
    if (!canFinalizeHandover(profile.role)) {
      return fail("Only staff may finalize a handover");
    }
    const supabase = await createClient();

    const { data: batch, error: batchError } = await supabase
      .from("carrier_batches")
      .select("id, reference, platform, parcel_count, status")
      .eq("id", form.batchId)
      .maybeSingle();
    if (batchError) return fail(batchError.message);
    if (!batch) return fail("Batch not found");
    if (batch.status !== "Ready") {
      return fail("Only Ready manifests can be handed over");
    }

    const { data: items } = await supabase
      .from("carrier_batch_items")
      .select("shipment_id")
      .eq("batch_id", batch.id);

    const ids = (items ?? []).map((i) => i.shipment_id);
    // Idempotent retry: parcels already handed over are skipped.
    let pendingIds = ids;
    if (ids.length > 0) {
      const { data: already } = await supabase
        .from("shipments")
        .select("id")
        .in("id", ids)
        .eq("status", "Handed Over");
      const done = new Set((already ?? []).map((p) => p.id));
      pendingIds = ids.filter((id) => !done.has(id));
    }

    // Atomic per-parcel handover: tracking event + seller notification.
    // The RPC also enforces the workflow order (manifested before handover).
    for (const parcelId of pendingIds) {
      const { data, error } = await supabase.rpc("update_parcel_status", {
        p_parcel_id: parcelId,
        p_status: "Handed Over",
        p_location: null,
        p_hub_id: null,
        p_description: null,
      });
      const result = data as { ok: boolean; error?: string } | null;
      if (error || !result?.ok) {
        return fail(
          result?.error ?? error?.message ?? "Handover failed for one or more parcels",
        );
      }
    }

    const { error: updateError } = await supabase
      .from("carrier_batches")
      .update({
        status: "Handed Over",
        rider_name: form.riderName,
        rider_phone: form.riderPhone || null,
        handover_notes: form.notes || null,
        handed_over_by: profile.id,
        handed_over_at: new Date().toISOString(),
      })
      .eq("id", batch.id);
    if (updateError) return fail(updateError.message);

    const { error: handoverError } = await supabase.from("handovers").insert({
      batch_id: batch.id,
      platform: batch.platform,
      rider_name: form.riderName,
      rider_phone: form.riderPhone || null,
      parcel_count: batch.parcel_count,
      notes: form.notes || null,
      handed_over_by: profile.id,
    });
    if (handoverError) return fail(handoverError.message);

    serverLog.info("handover.signHandover", {
      batchId: batch.id,
      reference: batch.reference,
      rider: form.riderName,
    });
    revalidatePath("/handover");
    revalidatePath("/manifest");
    revalidatePath("/dashboard");
    revalidatePath("/notifications");
    return ok({ batchId: batch.id });
  });
}
