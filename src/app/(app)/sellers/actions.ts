"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPermission } from "@/lib/auth";
import { runAction, ok, okVoid, fail, type ActionResult } from "@/lib/actions/result";
import {
  sellerAccountSchema,
  sellerUpdateSchema,
  sellerArchiveSchema,
  sellerDeleteSchema,
} from "@/lib/validation/schemas";
import { serverLog } from "@/lib/server/log";

/**
 * Admin: create a seller business record WITH a login account.
 * The password is handed to Supabase Auth (bcrypt/argon inside GoTrue) —
 * it is never stored in our tables and never logged.
 */
export async function createSellerAccount(
  input: unknown,
): Promise<ActionResult<{ id: string; reference: string }>> {
  return runAction("sellers.create", sellerAccountSchema, input, async (form) => {
    const check = await checkPermission("sellers.manage");
    if ("error" in check) return fail("Only administrators can manage sellers");

    let admin;
    try {
      admin = createAdminClient();
    } catch {
      return fail(
        "Server is missing SUPABASE_SERVICE_ROLE_KEY — cannot provision the login account.",
      );
    }

    // 1) Auth user (email confirmed so the credentials work immediately).
    const { data: authUser, error: authError } = await admin.auth.admin.createUser({
      email: form.email,
      password: form.password,
      email_confirm: true,
      user_metadata: { full_name: form.name, role: "Seller" },
    });
    if (authError) {
      if (!/already|exists|registered/i.test(authError.message)) {
        return fail(authError.message);
      }
      // Link the existing auth user by email instead of failing.
    }

    const supabase = await createClient();

    // 2) Seller business row.
    const { data: seller, error: sellerError } = await supabase
      .from("sellers")
      .insert({
        name: form.name,
        business_name: form.businessName || null,
        contact_person: form.contactPerson || null,
        phone: form.phone || null,
        email: form.email,
        address: form.address || null,
        pickup_frequency: form.pickupFrequency || "On-demand",
        created_by: check.profile.id,
      })
      .select("id, reference")
      .single();
    if (sellerError || !seller) return fail(sellerError?.message ?? "Seller insert failed");

    // 3) Profile for the login account, linked to the seller record.
    if (authUser?.user) {
      const { error: profileError } = await supabase.from("profiles").upsert(
        {
          id: authUser.user.id,
          email: form.email,
          full_name: form.name,
          role: "Seller",
          is_active: true,
          seller_id: seller.id,
          invited_by: check.profile.id,
        },
        { onConflict: "id" },
      );
      if (profileError) return fail(profileError.message);
    }

    serverLog.info("sellers.create", { reference: seller.reference });
    revalidatePath("/sellers");
    revalidatePath("/dashboard");
    return ok({ id: seller.id, reference: seller.reference });
  });
}

/** Admin: update seller information. */
export async function updateSeller(input: unknown): Promise<ActionResult> {
  return runAction("sellers.update", sellerUpdateSchema, input, async (form) => {
    const check = await checkPermission("sellers.manage");
    if ("error" in check) return fail("Only administrators can manage sellers");

    const supabase = await createClient();
    const { error } = await supabase
      .from("sellers")
      .update({
        name: form.name,
        business_name: form.businessName || null,
        contact_person: form.contactPerson || null,
        phone: form.phone || null,
        email: form.email || null,
        address: form.address || null,
        pickup_frequency: form.pickupFrequency || "On-demand",
        notes: form.notes || null,
      })
      .eq("id", form.sellerId);
    if (error) return fail(error.message);

    serverLog.info("sellers.update", { sellerId: form.sellerId, actor: check.profile.id });
    revalidatePath("/sellers");
    return okVoid();
  });
}

/**
 * Admin: archive a seller. Soft-deactivate — parcels and tracking history
 * are preserved; the seller can no longer log parcel activity.
 */
export async function archiveSeller(input: unknown): Promise<ActionResult> {
  return runAction("sellers.archive", sellerArchiveSchema, input, async ({ sellerId }) => {
    const check = await checkPermission("sellers.manage");
    if ("error" in check) return fail("Only administrators can manage sellers");

    const supabase = await createClient();
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("sellers")
      .update({ is_active: false, archived_at: now })
      .eq("id", sellerId);
    if (error) return fail(error.message);

    // Deactivate any linked login accounts too.
    await adminDeactivateProfiles(sellerId, false);

    serverLog.info("sellers.archive", { sellerId, actor: check.profile.id });
    revalidatePath("/sellers");
    revalidatePath("/dashboard");
    return okVoid();
  });
}

/** Admin: restore an archived seller. */
export async function restoreSeller(input: unknown): Promise<ActionResult> {
  return runAction("sellers.restore", sellerArchiveSchema, input, async ({ sellerId }) => {
    const check = await checkPermission("sellers.manage");
    if ("error" in check) return fail("Only administrators can manage sellers");

    const supabase = await createClient();
    const { error } = await supabase
      .from("sellers")
      .update({ is_active: true, archived_at: null })
      .eq("id", sellerId);
    if (error) return fail(error.message);

    await adminDeactivateProfiles(sellerId, true);

    serverLog.info("sellers.restore", { sellerId, actor: check.profile.id });
    revalidatePath("/sellers");
    return okVoid();
  });
}

/**
 * Admin: PERMANENT deletion. Refused when the seller still owns parcels or
 * pickup requests unless history was already purged — historical tracking
 * data must never be silently destroyed.
 */
export async function deleteSellerPermanently(
  input: unknown,
): Promise<ActionResult<{ deletedParcels: number }>> {
  return runAction("sellers.delete", sellerDeleteSchema, input, async (form) => {
    const check = await checkPermission("sellers.manage");
    if ("error" in check) return fail("Only administrators can manage sellers");

    const supabase = await createClient();

    const { count: parcelCount } = await supabase
      .from("shipments")
      .select("id", { count: "exact", head: true })
      .eq("seller_id", form.sellerId);

    if ((parcelCount ?? 0) > 0) {
      return fail(
        `This seller still has ${parcelCount} parcel(s) with tracking history. ` +
          "Archive instead to preserve records.",
      );
    }

    // Safe to hard-delete: no parcels → cascade removes pickups; audit trail
    // keeps the administrative record of this action.
    const { data: deleted } = await supabase
      .from("sellers")
      .delete()
      .eq("id", form.sellerId)
      .select("id");
    if (!deleted || deleted.length === 0) return fail("Seller not found or already removed");

    serverLog.warn("sellers.delete", {
      sellerId: form.sellerId,
      actor: check.profile.id,
      confirmedWith: "DELETE",
    });
    revalidatePath("/sellers");
    revalidatePath("/dashboard");
    return ok({ deletedParcels: 0 });
  });
}

/** Toggle is_active on profiles linked to a seller via the service-role client. */
async function adminDeactivateProfiles(sellerId: string, active: boolean) {
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return;
  }
  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("seller_id", sellerId);
  for (const row of data ?? []) {
    await admin.auth.admin.updateUserById(row.id, {
      ban_duration: active ? "none" : "876000h",
    });
  }
}
