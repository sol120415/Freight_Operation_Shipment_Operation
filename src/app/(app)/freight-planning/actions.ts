"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";
import {
  freightConsolidationSchema,
  freightDeconsolidationSchema,
  freightPlanSchema,
} from "@/lib/validation/schemas";
import { runAction, ok, fail, type ActionResult } from "@/lib/actions/result";

type FreightRpcResult = {
  ok: boolean;
  error?: string;
  id?: string;
  reference?: string;
};

export async function saveFreightPlan(input: unknown): Promise<ActionResult<{ id: string; reference: string }>> {
  return runAction("freightPlanning.savePlan", freightPlanSchema, input, async (form) => {
    await requirePermission("planning.manage");
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_freight_load_plan", {
      p_origin: form.origin,
      p_destination: form.destination,
      p_transport_mode: form.transportMode,
      p_incoterms: form.incoterms,
      p_route_name: form.routeName,
      p_carrier_name: form.carrierName,
      p_transit_time_days: form.transitTimeDays,
      p_estimated_cost_php: form.estimatedCostPHP,
      p_co2_reduction_percent: form.co2ReductionPercent,
      p_risk_score: form.riskScore,
      p_key_advantage: form.keyAdvantage,
      p_max_weight_kg: form.maxWeightKg,
      p_max_volume_cbm: form.maxVolumeCbm,
      p_shipment_ids: form.shipmentIds,
    });
    const result = data as FreightRpcResult | null;
    if (error || !result?.ok || !result.id || !result.reference) {
      return fail(result?.error ?? error?.message ?? "Could not save the freight plan");
    }
    revalidatePath("/freight-planning");
    return ok({ id: result.id, reference: result.reference });
  });
}

export async function createFreightConsolidation(
  input: unknown,
): Promise<ActionResult<{ id: string; reference: string }>> {
  return runAction("freightPlanning.createConsolidation", freightConsolidationSchema, input, async (form) => {
    await requirePermission("planning.manage");
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_freight_consolidation", {
      p_container_type: form.containerType,
      p_load_type: form.loadType,
      p_max_volume_cbm: form.maxVolumeCbm,
      p_max_weight_kg: form.maxWeightKg,
      p_origin: form.origin,
      p_destination: form.destination,
      p_shipment_ids: form.shipmentIds,
    });
    const result = data as FreightRpcResult | null;
    if (error || !result?.ok || !result.id || !result.reference) {
      return fail(result?.error ?? error?.message ?? "Could not create the consolidation");
    }
    revalidatePath("/freight-planning");
    revalidatePath("/parcels");
    return ok({ id: result.id, reference: result.reference });
  });
}

export async function deconsolidateFreightShipment(
  input: unknown,
): Promise<ActionResult> {
  return runAction(
    "freightPlanning.deconsolidateShipment",
    freightDeconsolidationSchema,
    input,
    async (form) => {
      await requirePermission("planning.manage");
      const supabase = await createClient();
      const { data, error } = await supabase.rpc("deconsolidate_freight_shipment", {
        p_container_id: form.containerId,
        p_shipment_id: form.shipmentId,
      });
      const result = data as FreightRpcResult | null;
      if (error || !result?.ok) {
        return fail(result?.error ?? error?.message ?? "Could not deconsolidate the shipment");
      }
      revalidatePath("/freight-planning");
      revalidatePath("/parcels");
      return { ok: true };
    },
  );
}
