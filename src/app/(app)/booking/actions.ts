"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";
import { z } from "zod";
import { runAction, ok, okVoid, fail, type ActionResult } from "@/lib/actions/result";
import { bookingSchema, cancelBookingSchema } from "@/lib/validation/schemas";
import { serverLog } from "@/lib/server/log";

/**
 * Create a booking through the shared database operation. The database
 * generates identifiers and records the first tracking event atomically.
 */
export async function createBooking(
  input: unknown,
): Promise<ActionResult<{ reference: string; shipmentId: string }>> {
  return runAction("booking.createBooking", bookingSchema, input, async (form) => {
    await requirePermission("bookings.manage");
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_parcel", {
      p_source: "booking",
      p_idempotency_key: form.idempotencyKey,
      p_seller_id: form.sellerId,
      p_consignee: form.consignee,
      p_destination: form.destination,
      p_platform: form.platform,
      p_delivery_method: "Drop-off",
      p_origin: "Branch Hub",
      p_initial_status: "Booked",
      p_service_type: form.serviceType,
      p_weight_kg: form.weightKg,
      p_cod_amount: form.codAmount,
      p_external_tracking_number: form.externalTrackingNumber || null,
    });
    const result = data as {
      ok: boolean;
      error?: string;
      id?: string;
      reference?: string;
      duplicate?: boolean;
    } | null;
    if (error || !result?.ok || !result.id || !result.reference) {
      return fail(result?.error ?? error?.message ?? "Failed to create booking");
    }

    serverLog.info("booking.createBooking", {
      reference: result.reference,
      duplicate: result.duplicate ?? false,
    });
    revalidatePath("/booking");
    revalidatePath("/dashboard");
    return ok({ reference: result.reference, shipmentId: result.id });
  });
}

/** Cancel a parcel with a required reason. */
export async function cancelBooking(
  shipmentId: string,
  cancelReason: string,
): Promise<ActionResult> {
  return runAction("booking.cancelBooking", cancelBookingSchema, {
    shipmentId,
    cancelReason,
  }, async ({ cancelReason: reason }) => {
    await requirePermission("bookings.manage");
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("update_parcel_status", {
      p_parcel_id: shipmentId,
      p_status: "Cancelled",
      p_description: reason,
    });
    const result = data as { ok: boolean; error?: string } | null;
    if (error || !result?.ok) return fail(result?.error ?? error?.message ?? "Cancellation failed");
    revalidatePath("/booking");
    revalidatePath("/dashboard");
    return okVoid();
  });
}

/** Archive (soft-delete) a parcel to declutter the active list. */
export async function archiveBooking(shipmentId: string): Promise<ActionResult> {
  return runAction(
    "booking.archiveBooking",
    z.object({ shipmentId: z.string().uuid() }),
    { shipmentId },
    async () => {
      await requirePermission("bookings.manage");
      const supabase = await createClient();
      const { data, error } = await supabase.rpc("update_parcel_status", {
        p_parcel_id: shipmentId,
        p_status: "Archived",
        p_description: "Booking archived after completion or cancellation",
      });
      const result = data as { ok: boolean; error?: string } | null;
      if (error || !result?.ok) {
        return fail(result?.error ?? error?.message ?? "Archiving failed");
      }
      revalidatePath("/booking");
      revalidatePath("/dashboard");
      return okVoid();
    },
  );
}
