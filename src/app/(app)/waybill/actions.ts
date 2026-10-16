"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";
import { runAction, ok, fail, type ActionResult } from "@/lib/actions/result";
import { bolSchema, type BolInput } from "@/lib/validation/schemas";
import { manilaDateISO } from "@/lib/utils";

export type { BolInput };

/** Insert a House or Master Waybill / Bill of Lading. Staff only. */
export async function createBillOfLading(
  input: BolInput,
): Promise<ActionResult<{ id: string; bolNumber: string }>> {
  return runAction("waybill.createBillOfLading", bolSchema, input, async (form) => {
    const profile = await requirePermission("documents.manage");
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("bills_of_lading")
      .insert({
        bol_number: form.bolType === "HBL" ? "" : form.bolNumber,
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
        issued_date: manilaDateISO(),
        issued_by: profile.id,
        finalized_at: new Date().toISOString(),
        created_by: profile.id,
      })
      .select("id, bol_number")
      .single();

    if (error) return fail(error.message);
    revalidatePath("/waybill");
    return ok({ id: data.id, bolNumber: data.bol_number });
  });
}
