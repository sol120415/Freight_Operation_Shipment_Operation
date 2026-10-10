"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { runAction, ok, okVoid, fail, type ActionResult } from "@/lib/actions/result";
import { batchCreateSchema, batchReadySchema } from "@/lib/validation/schemas";
import { serverLog } from "@/lib/server/log";

/**
 * Create a courier manifest (batch) for a platform and attach parcels to it.
 * Parcels flip from the Received/Booked stages → Batched (= Manifested).
 * Batches go Draft → Ready → Handed Over.
 */
export async function createBatch(
  input: unknown,
): Promise<ActionResult<{ id: string; reference: string }>> {
  return runAction("manifest.createBatch", batchCreateSchema, input, async (form) => {
    await requireRole(["SuperAdmin", "Admin"]);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_manifest", {
      p_platform: form.platform,
      p_parcel_ids: form.parcelIds,
      p_idempotency_key: form.idempotencyKey,
    });
    const result = data as {
      ok: boolean;
      error?: string;
      id?: string;
      reference?: string;
      duplicate?: boolean;
    } | null;
    if (error || !result?.ok || !result.id || !result.reference) {
      return fail(result?.error ?? error?.message ?? "Failed to create manifest");
    }

    serverLog.info("manifest.createBatch", {
      reference: result.reference,
      count: form.parcelIds.length,
      duplicate: result.duplicate ?? false,
    });
    revalidatePath("/manifest");
    revalidatePath("/dashboard");
    return ok({ id: result.id, reference: result.reference });
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
      const { data, error } = await supabase.rpc("mark_manifest_ready", {
        p_batch_id: id,
      });
      const result = data as { ok: boolean; error?: string } | null;
      if (error || !result?.ok) {
        return fail(result?.error ?? error?.message ?? "Could not mark the manifest Ready");
      }
      revalidatePath("/manifest");
      revalidatePath("/dashboard");
      return ok({ ready: true });
    },
  );
}

/** Back out a Draft manifest and restore each parcel's previous status. */
export async function releaseBatch(batchId: string): Promise<ActionResult> {
  return runAction(
    "manifest.releaseBatch",
    batchReadySchema,
    { batchId },
    async ({ batchId: id }) => {
      await requireRole(["SuperAdmin", "Admin"]);
      const supabase = await createClient();

      const { data, error } = await supabase.rpc("release_manifest", {
        p_batch_id: id,
      });
      const result = data as { ok: boolean; error?: string } | null;
      if (error || !result?.ok) {
        return fail(result?.error ?? error?.message ?? "Could not release the manifest");
      }

      revalidatePath("/manifest");
      revalidatePath("/dashboard");
      return okVoid();
    },
  );
}
