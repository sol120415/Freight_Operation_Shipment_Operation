"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { runAction, ok, fail, type ActionResult } from "@/lib/actions/result";
import { bolSchema, type BolInput } from "@/lib/validation/schemas";

export type { BolInput };

/** Insert a House or Master Waybill / Bill of Lading. Staff only. */
export async function createBillOfLading(
  input: BolInput,
): Promise<ActionResult<{ id: string }>> {
  return runAction("waybill.createBillOfLading", bolSchema, input, async (form) => {
    const profile = await requireRole(["SuperAdmin", "Admin"]);
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("bills_of_lading")
      .insert({
        bol_number: form.bolNumber,
        bol_type: form.bolType,
        shipment_id: form.shipmentId ?? null,
        shipper_name: form.shipperName,
        consignee_name: form.consigneeName,
        notify_party: form.notifyParty,
        container_number: form.containerNumber,
        seal_number: form.sealNumber,
        total_weight_kg: form.totalWeightKg,
        total_volume_cbm: form.totalVolumeCbm,
        goods_description: form.goodsDescription,
        freight_terms: form.freightTerms,
        issued_date: new Date().toISOString().slice(0, 10),
        created_by: profile.id,
      })
      .select("id")
      .single();

    if (error) return fail(error.message);
    revalidatePath("/waybill");
    return ok({ id: data.id });
  });
}
