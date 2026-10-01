"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { runAction, ok, okVoid, fail, type ActionResult } from "@/lib/actions/result";
import {
  sellerSchema,
  pickupSchema,
  pickupStatusSchema,
  parcelIntakeSchema,
} from "@/lib/validation/schemas";
import { serverLog } from "@/lib/server/log";

function newRef(prefix: string) {
  const yr = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${yr}-${rand}`;
}

/** Register a recurring seller at the hub. */
export async function createSeller(
  input: unknown,
): Promise<ActionResult<{ id: string; reference: string }>> {
  return runAction("pickup.createSeller", sellerSchema, input, async (form) => {
    const profile = await requireRole(["SuperAdmin", "Admin"]);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("sellers")
      .insert({
        reference: newRef("SEL"),
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
    const profile = await requireRole(["SuperAdmin", "Admin"]);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pickup_requests")
      .insert({
        reference: newRef("PUP"),
        seller_id: form.sellerId,
        scheduled_at: form.scheduledAt,
        status: "Scheduled",
        parcel_count: form.parcelCount,
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
): Promise<ActionResult> {
  return runAction("pickup.updatePickupStatus", pickupStatusSchema, {
    pickupId,
    status,
  }, async ({ status: s }) => {
    await requireRole(["SuperAdmin", "Admin"]);
    const supabase = await createClient();
    const { error } = await supabase
.from("pickup_requests")
        .update({ status: s })
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
    const profile = await requireRole(["SuperAdmin", "Admin"]);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("shipments")
      .insert({
        reference: form.reference,
        tracking_number: form.trackingNumber || `TRK-HUB-${Math.floor(10000 + Math.random() * 90000)}`,
        client_name: "Walk-in Seller",
        consignee: form.consignee || null,
        origin: "Branch Hub",
        destination: form.destination,
        status: "Intake",
        platform: form.platform,
        weight_kg: form.weightKg,
        cod_amount: form.codAmount,
        seller_id: form.sellerId || null,
        current_location: "Branch Hub",
        progress: 10,
        created_by: profile.id,
      })
      .select("id, reference")
      .single();
    if (error) return fail(error.message);
    revalidatePath("/pickup");
    return ok({ reference: data.reference });
  });
}
