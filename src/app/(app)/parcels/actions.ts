"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  requireProfile,
  checkPermission,
  isSellerRole,
} from "@/lib/auth";
import { runAction, ok, okVoid, fail, type ActionResult } from "@/lib/actions/result";
import {
  parcelCreateSchema,
  parcelStatusSchema,
  parcelLocationSchema,
  parcelEditSchema,
  cancelBookingSchema as cancelParcelSchema,
} from "@/lib/validation/schemas";
import { serverLog } from "@/lib/server/log";

/**
 * Parcel management actions.
 *
 * Every action authorizes through lib/auth (DB-backed profile) and relies on
 * RLS as the second enforcement layer. Status changes go through the
 * `update_parcel_status` Postgres RPC so the shipment row, the tracking
 * event, the hub/location refresh and the seller/customer notifications are
 * written atomically in one database round trip.
 */

/** Register a new parcel. Sellers create their own; staff may pick a seller. */
export async function createParcel(
  input: unknown,
): Promise<
  ActionResult<{
    id: string;
    trackingNumber: string;
    reference: string;
    /** Non-fatal notice, e.g. recipient email didn't match an account. */
    warning?: string;
  }>
> {
  return runAction("parcels.create", parcelCreateSchema, input, async (form) => {
    const check = await checkPermission("parcels.create");
    if ("error" in check) return fail("You are not allowed to create parcels");
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_parcel", {
      p_source: "new_parcel",
      p_idempotency_key: form.idempotencyKey,
      p_seller_id: form.sellerId || null,
      p_customer_email: form.customerEmail || null,
      p_consignee: form.consignee,
      p_destination: form.destination,
      p_platform: form.platform,
      p_delivery_method: form.deliveryMethod,
      p_origin: form.origin,
      p_initial_status: "Registered",
      p_service_type: form.serviceType,
      p_weight_kg: form.weightKg,
      p_cod_amount: form.codAmount,
      p_shipping_fee: form.shippingFee || null,
      p_description: form.description || null,
      p_dimensions: form.dimensions || null,
      p_recipient_phone: form.recipientPhone || null,
      p_expected_delivery_date: form.expectedDeliveryDate || null,
      p_external_tracking_number: form.externalTrackingNumber || null,
    });
    const result = data as {
      ok: boolean;
      error?: string;
      id?: string;
      reference?: string;
      tracking_number?: string;
      warning?: string | null;
      duplicate?: boolean;
    } | null;
    if (error || !result?.ok || !result.id || !result.reference || !result.tracking_number) {
      return fail(result?.error ?? error?.message ?? "Failed to register parcel");
    }

    serverLog.info("parcels.create", {
      tracking_number: result.tracking_number,
      duplicate: result.duplicate ?? false,
    });

    revalidatePath("/parcels");
    revalidatePath("/dashboard");
    return ok({
      id: result.id,
      trackingNumber: result.tracking_number,
      reference: result.reference,
      ...(result.warning ? { warning: result.warning } : {}),
    });
  });
}

/** Status change: validated, atomic, notifies seller + customer. */
export async function updateParcelStatus(
  input: unknown,
): Promise<ActionResult> {
  return runAction("parcels.updateStatus", parcelStatusSchema, input, async (form) => {
    const check = await checkPermission("parcels.updateStatus");
    if ("error" in check) return fail("Only operations staff can change parcel status");

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("update_parcel_status", {
      p_parcel_id: form.parcelId,
      p_status: form.status,
      p_location: form.location || null,
      p_hub_id: form.hubId || null,
      p_description: form.description || null,
    });

    const result = data as { ok: boolean; error?: string } | null;
    if (error || !result?.ok) {
      return fail(result?.error ?? error?.message ?? "Status update failed");
    }

    serverLog.info("parcels.updateStatus", {
      parcelId: form.parcelId,
      status: form.status,
      actor: check.profile.id,
    });
    revalidatePath(`/parcels/${form.parcelId}`);
    revalidatePath("/parcels");
    revalidatePath("/dashboard");
    return okVoid();
  });
}

/** Admin/staff: update the parcel's current hub / free-text location. */
export async function updateParcelLocation(
  input: unknown,
): Promise<ActionResult> {
  return runAction("parcels.updateLocation", parcelLocationSchema, input, async (form) => {
    const check = await checkPermission("hubs.manage");
    if ("error" in check) {
      return fail("Only operations staff can move parcels between facilities");
    }

    const supabase = await createClient();

    let locationLabel = form.location || null;
    if (form.hubId && !locationLabel) {
      const { data: hub } = await supabase
        .from("hubs")
        .select("name")
        .eq("id", form.hubId)
        .maybeSingle();
      locationLabel = hub?.name ?? null;
    }

    const { data, error } = await supabase.rpc("update_parcel_location", {
      p_parcel_id: form.parcelId,
      p_hub_id: form.hubId || null,
      p_location: locationLabel,
      p_description: `Current location set to ${locationLabel ?? "unassigned"}`,
    });
    const result = data as { ok: boolean; error?: string } | null;
    if (error || !result?.ok) {
      return fail(result?.error ?? error?.message ?? "Location update failed");
    }

    serverLog.info("parcels.updateLocation", { parcelId: form.parcelId });
    revalidatePath(`/parcels/${form.parcelId}`);
    revalidatePath("/dashboard");
    return okVoid();
  });
}

/** Seller edits own parcel details while it is still Registered. */
export async function editOwnParcel(input: unknown): Promise<ActionResult> {
  return runAction("parcels.editOwn", parcelEditSchema, input, async (form) => {
    const profile = await requireProfile();
    if (!isSellerRole(profile.role)) {
      return fail("Only the selling account can edit a registered parcel");
    }
    const supabase = await createClient();
    const { error } = await supabase
      .from("shipments")
      .update({
        consignee: form.consignee,
        recipient_phone: form.recipientPhone || null,
        description: form.description || null,
        weight_kg: form.weightKg,
      })
      .eq("id", form.parcelId);
    if (error) return fail(error.message);

    revalidatePath(`/parcels/${form.parcelId}`);
    return okVoid();
  });
}

/** Cancel a parcel with a reason (staff). */
export async function cancelParcel(
  input: unknown,
): Promise<ActionResult> {
  return runAction("parcels.cancel", cancelParcelSchema, input, async (form) => {
    const check = await checkPermission("parcels.updateStatus");
    if ("error" in check) return fail("Only operations staff can cancel parcels");

    const supabase = await createClient();

    const rpc = await supabase.rpc("update_parcel_status", {
      p_parcel_id: form.shipmentId,
      p_status: "Cancelled",
      p_description: form.cancelReason,
    });
    const result = rpc.data as { ok: boolean; error?: string } | null;
    if (rpc.error || !result?.ok) {
      return fail(result?.error ?? rpc.error?.message ?? "Cancellation failed");
    }

    revalidatePath(`/parcels/${form.shipmentId}`);
    revalidatePath("/parcels");
    return okVoid();
  });
}
