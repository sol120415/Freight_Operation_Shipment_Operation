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

    const { data, error } = await supabase.rpc("finalize_handover", {
      p_batch_id: form.batchId,
      p_rider_name: form.riderName,
      p_rider_phone: form.riderPhone || null,
      p_notes: form.notes || null,
    });
    const result = data as {
      ok: boolean;
      error?: string;
      batch_id?: string;
      handover_id?: string;
      duplicate?: boolean;
    } | null;
    if (error || !result?.ok || !result.batch_id) {
      return fail(result?.error ?? error?.message ?? "Handover failed");
    }

    serverLog.info("handover.signHandover", {
      batchId: result.batch_id,
      rider: form.riderName,
      actor: profile.id,
      duplicate: result.duplicate ?? false,
    });
    revalidatePath("/handover");
    revalidatePath("/manifest");
    revalidatePath("/dashboard");
    revalidatePath("/notifications");
    return ok({ batchId: result.batch_id });
  });
}
