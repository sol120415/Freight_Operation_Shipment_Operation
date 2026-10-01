"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { z } from "zod";
import { runAction, ok, okVoid, fail, type ActionResult } from "@/lib/actions/result";
import { bookingSchema, cancelBookingSchema } from "@/lib/validation/schemas";
import { serverLog } from "@/lib/server/log";
import type { DeliveryPlatform } from "@/types";

export interface BookingFields {
  clientName: string;
  consignee: string;
  platform: DeliveryPlatform;
  destination: string;
  weightKg: number;
  codAmount: number;
  serviceType: string;
  trackingNumber: string;
}

function newReference() {
  const yr = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `SHP-${yr}-${rand}`;
}

/**
 * Intake a parcel at the hub. Parcels enter as "Intake", then move to
 * "Batched" once added to a carrier manifest and to "Handed Over" when the
 * rider signs off. Retries on the rare random-reference collision.
 */
export async function createBooking(
  input: BookingFields,
): Promise<ActionResult<{ reference: string; shipmentId: string }>> {
  return runAction("booking.createBooking", bookingSchema, input, async (form) => {
    const profile = await requireRole(["SuperAdmin", "Admin"]);
    const supabase = await createClient();

    let lastError: string | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const reference = newReference();
      const { data, error } = await supabase
        .from("shipments")
        .insert({
          reference,
          tracking_number:
            form.trackingNumber ||
            `TRK-HUB-${Math.floor(10000 + Math.random() * 90000)}`,
          client_name: form.clientName,
          consignee: form.consignee,
          origin: "Branch Hub",
          destination: form.destination,
          // Shipment bookings are hub-intake records; road is the supported
          // transport mode until the booking form exposes mode selection.
          mode: "Road",
          status: "Intake",
          platform: form.platform,
          service_type: form.serviceType,
          cod_amount: form.codAmount,
          weight_kg: form.weightKg,
          current_location: "Branch Hub",
          progress: 10,
          created_by: profile.id,
        })
        .select("id, reference")
        .single();

      if (error) {
        if (/duplicate key|23505/i.test(error.message)) {
          lastError = error.message;
          continue;
        }
        return fail(error.message);
      }
      if (!data) return fail("Failed to create booking");

      await supabase.from("shipment_tracking_logs").insert({
        shipment_id: data.id,
        event_type: "booking",
        level: "success",
        message: `Parcel ${reference} intaken at Branch Hub for ${form.clientName} via ${form.platform}`,
        location: "Branch Hub",
        created_by: profile.id,
      });

      revalidatePath("/booking");
      revalidatePath("/dashboard");
      return ok({ reference, shipmentId: data.id });
    }

    serverLog.warn("booking.createBooking", { err: lastError, attempts: 3 });
    return fail(lastError ?? "Could not create booking; try again");
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
    await requireRole(["SuperAdmin", "Admin"]);
    const supabase = await createClient();
    const { error } = await supabase
      .from("shipments")
      .update({ status: "Cancelled", cancel_reason: reason })
      .eq("id", shipmentId);
    if (error) return fail(error.message);
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
      await requireRole(["SuperAdmin", "Admin"]);
      const supabase = await createClient();
      const { error } = await supabase
        .from("shipments")
        .update({ status: "Archived", archived_at: new Date().toISOString() })
        .eq("id", shipmentId);
      if (error) return fail(error.message);
      revalidatePath("/booking");
      revalidatePath("/dashboard");
      return okVoid();
    },
  );
}
