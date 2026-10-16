"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";
import { runAction, ok, okVoid, fail, type ActionResult } from "@/lib/actions/result";
import {
  sellerSchema,
  pickupSchema,
  pickupStatusSchema,
  parcelIntakeSchema,
} from "@/lib/validation/schemas";
import { serverLog } from "@/lib/server/log";

/** Register a recurring seller at the hub. */
export async function createSeller(
  input: unknown,
): Promise<ActionResult<{ id: string; reference: string }>> {
  return runAction("pickup.createSeller", sellerSchema, input, async (form) => {
    const profile = await requirePermission("sellers.manage");
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("sellers")
      .insert({
        name: form.name,
        contact_person: form.contactPerson || null,
        phone: form.phone || null,
        email: form.email || null,
        address: form.address || null,
        pickup_frequency: form.pickupFrequency || "On-demand",
        created_by: profile.id,
      })
      .select("id, reference")
      .single();
    if (error) return fail(error.message);
    serverLog.info("pickup.createSeller", { reference: data.reference });
    revalidatePath("/pickup");
    return ok({ id: data.id, reference: data.reference });
  });
}

/** Schedule a pickup for a seller. */
export async function createPickup(
  input: unknown,
): Promise<ActionResult<{ id: string; reference: string }>> {
  return runAction("pickup.createPickup", pickupSchema, input, async (form) => {
    const profile = await requirePermission("pickup.manage");
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pickup_requests")
      .insert({
        seller_id: form.sellerId,
        scheduled_at: form.scheduledAt,
        status: "Scheduled",
        parcel_count: form.expectedParcelCount,
        expected_parcel_count: form.expectedParcelCount,
        idempotency_key: form.idempotencyKey,
        notes: form.notes || null,
        created_by: profile.id,
      })
      .select("id, reference")
      .single();
    if (error) return fail(error.message);
    serverLog.info("pickup.createPickup", { reference: data.reference });
    revalidatePath("/pickup");
    revalidatePath("/dashboard");
    return ok({ id: data.id, reference: data.reference });
  });
}

/** Advance a pickup through Scheduled → In Transit → Received etc. */
export async function updatePickupStatus(
  pickupId: string,
  status: string,
  actualParcelCount?: number,
): Promise<ActionResult> {
  return runAction("pickup.updatePickupStatus", pickupStatusSchema, {
    pickupId,
    status,
    actualParcelCount,
  }, async ({ status: s, actualParcelCount: actual }) => {
    await requirePermission("pickup.manage");
    const supabase = await createClient();
    const { error } = await supabase
.from("pickup_requests")
        .update({
          status: s,
          ...(s === "Received" ? { actual_parcel_count: actual } : {}),
        })
        .eq("id", pickupId);
      if (error) return fail(error.message);
      revalidatePath("/pickup");
      revalidatePath("/dashboard");
      return okVoid();
    },
  );
}

/**
 * Quick intake counter: register a single parcel straight into Intake
 * without the full booking form. Used from the pickup counter UI.
 */
export async function quickIntake(
  input: unknown,
): Promise<ActionResult<{ reference: string }>> {
  return runAction("pickup.quickIntake", parcelIntakeSchema, input, async (form) => {
    await requirePermission("intake.manage");
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_parcel", {
      p_source: "quick_intake",
      p_idempotency_key: form.idempotencyKey,
      p_seller_id: form.sellerId || null,
      p_consignee: form.consignee || "Walk-in Recipient",
      p_destination: form.destination,
      p_platform: form.platform,
      p_delivery_method: "Drop-off",
      p_origin: "Branch Hub",
      p_initial_status: "Intake",
      p_service_type: form.serviceType,
      p_weight_kg: form.weightKg,
      p_cod_amount: form.codAmount,
      p_external_tracking_number: form.externalTrackingNumber || null,
    });
    const result = data as {
      ok: boolean;
      error?: string;
      reference?: string;
      duplicate?: boolean;
    } | null;
    if (error || !result?.ok || !result.reference) {
      return fail(result?.error ?? error?.message ?? "Intake failed");
    }
    serverLog.info("pickup.quickIntake", {
      reference: result.reference,
      duplicate: result.duplicate ?? false,
    });
    revalidatePath("/pickup");
    return ok({ reference: result.reference });
  });
}
