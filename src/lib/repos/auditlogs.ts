import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export interface AuditLogRow {
  id: number;
  table_name: string;
  record_id: string | null;
  action: "INSERT" | "UPDATE" | "DELETE";
  actor_id: string | null;
  actorEmail: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
}

/**
 * Audit trail for administrative actions. RLS restricts reads to Admin; this
 * repo is only ever invoked from admin-gated pages.
 */
export const listAuditLogs = cache(
  async (limit = 200): Promise<AuditLogRow[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(`Could not load audit logs: ${error.message}`);

    const rows = (data ?? []) as AuditLogRow[];
    const actorIds = [...new Set(rows.map((row) => row.actor_id).filter((id): id is string => Boolean(id)))];
    const actorById = new Map<string, string | null>();
    if (actorIds.length > 0) {
      const { data: actors, error: actorError } = await supabase
        .from("profiles")
        .select("id, email")
        .in("id", actorIds);
      if (actorError) throw new Error(`Could not load audit actors: ${actorError.message}`);
      for (const actor of actors ?? []) actorById.set(actor.id, actor.email);
    }

    return rows.map((row) => ({
      ...row,
      actorEmail: row.actor_id ? actorById.get(row.actor_id) ?? null : null,
    }));
  },
);
