"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { runAction, ok, okVoid, fail, type ActionResult } from "@/lib/actions/result";
import { batchCreateSchema, batchReadySchema } from "@/lib/validation/schemas";
import { serverLog } from "@/lib/server/log";

function newReference() {
  const yr = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `MNF-${yr}-${rand}`;
}

/**
 * Create a courier manifest (batch) for a platform and attach parcels to it.
 * Parcels flip from the Received/Booked stages → Batched (= Manifested).
 * Batches go Draft → Ready → Handed Over.
 */
export async function createBatch(
  input: unknown,
): Promise<ActionResult<{ id: string; reference: string }>> {
  return runAction("manifest.createBatch", batchCreateSchema, input, async (form) => {
    const profile = await requireRole(["SuperAdmin", "Admin"]);
    const supabase = await createClient();

    const { data: parcels, error: parcelsError } = await supabase
      .from("shipments")
      .select("id, weight_kg, platform, status, reference, tracking_number")
      .in("id", form.parcelIds);

    if (parcelsError) return fail(parcelsError.message);
    if (!parcels?.length) return fail("No matching parcels to batch");

    // Manifestable = received at the hub (pickup / drop-off / intake) or
    // booked. Registered parcels must be received or booked first; parcels
    // already handed over or further downstream cannot move back.
    const MANIFESTABLE = [
      "Pickup Scheduled",
      "Picked Up",
      "Dropped Off",
      "Intake",
      "At Origin Hub",
      "Booked",
    ];
    const wrongPlatform = parcels.filter((p) => p.platform !== form.platform);
    const notReady = parcels.filter((p) => !MANIFESTABLE.includes(p.status));
    if (wrongPlatform.length || notReady.length) {
      return fail(
        `${wrongPlatform.length} parcel(s) belong to another platform and ${notReady.length} are not received/booked yet (register → receive → book before manifesting).`,
      );
    }

    const totalWeight = parcels.reduce((acc, p) => acc + Number(p.weight_kg ?? 0), 0);
    const reference = newReference();

    const { data: batch, error: batchError } = await supabase
      .from("carrier_batches")
      .insert({
        reference,
        platform: form.platform,
        status: "Draft",
        parcel_count: parcels.length,
        total_weight_kg: totalWeight,
        created_by: profile.id,
      })
      .select("id, reference")
      .single();

    if (batchError || !batch) return fail(batchError?.message ?? "Failed to create batch");

    const items = parcels.map((p, i) => ({
      batch_id: batch.id,
      shipment_id: p.id,
      sequence_no: i + 1,
    }));
    const { error: itemsError } = await supabase.from("carrier_batch_items").insert(items);
    if (itemsError) return fail(itemsError.message);

    const { error: updateError } = await supabase
      .from("shipments")
      .update({ status: "Batched", manifested_at: new Date().toISOString() })
      .in("id", form.parcelIds);
    if (updateError) return fail(updateError.message);

    // Each manifesting step is recorded on the parcel tracking history.
    await supabase.from("shipment_tracking_logs").insert(
      parcels.map((p) => ({
        shipment_id: p.id,
        event_type: "status",
        level: "info",
        message: `Parcel added to manifest ${reference}`,
        status: "Batched",
        created_by: profile.id,
      })),
    );

    serverLog.info("manifest.createBatch", { reference: batch.reference, count: items.length });
    revalidatePath("/manifest");
    revalidatePath("/dashboard");
    return ok({ id: batch.id, reference: batch.reference });
  });
}

/** Mark a batch Ready — the handover screen will list it for sign-off. */
export async function markBatchReady(
  batchId: string,
): Promise<ActionResult<{ ready: boolean }>> {
  return runAction(
    "manifest.markBatchReady",
    batchReadySchema,
    { batchId },
    async ({ batchId: id }) => {
      await requireRole(["SuperAdmin", "Admin"]);
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("carrier_batches")
        .update({ status: "Ready" })
        .eq("id", id)
        .eq("status", "Draft")
        .select("id")
        .maybeSingle();
      if (error) return fail(error.message);
      if (!data) return fail("Batch not found or already Ready/Handed Over");
      revalidatePath("/manifest");
      revalidatePath("/dashboard");
      return ok({ ready: true });
    },
  );
}

/** Back out a Draft batch: release its parcels back to Intake. */
export async function releaseBatch(batchId: string): Promise<ActionResult> {
  return runAction(
    "manifest.releaseBatch",
    batchReadySchema,
    { batchId },
    async ({ batchId: id }) => {
      await requireRole(["SuperAdmin", "Admin"]);
      const supabase = await createClient();

      const { data: batch } = await supabase
        .from("carrier_batches")
        .select("id")
        .eq("id", id)
        .eq("status", "Draft")
        .maybeSingle();
      if (!batch) return fail("Only Draft batches can be released");

      const { data: items } = await supabase
        .from("carrier_batch_items")
        .select("shipment_id")
        .eq("batch_id", id);

      const { error: itemsError } = await supabase
        .from("carrier_batch_items")
        .delete()
        .eq("batch_id", id);
      if (itemsError) return fail(itemsError.message);

      if (items?.length) {
        const { error: updateError } = await supabase
          .from("shipments")
          .update({ status: "Intake" })
          .in("id", items.map((i) => i.shipment_id));
        if (updateError) return fail(updateError.message);
      }

      const { error: delError } = await supabase
        .from("carrier_batches")
        .delete()
        .eq("id", id);
      if (delError) return fail(delError.message);

      revalidatePath("/manifest");
      revalidatePath("/dashboard");
      return okVoid();
    },
  );
}
