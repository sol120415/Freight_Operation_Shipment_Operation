"use client";

import { useEffect, useState } from "react";
import { Radio } from "lucide-react";
import { createClient, uniqueChannel } from "@/lib/supabase/client";
import type { TrackingLog } from "@/types";

function levelDot(level: string) {
  if (level === "warning") return "bg-amber-500";
  if (level === "success") return "bg-emerald-500";
  if (level === "error") return "bg-rose-500";
  return "bg-pink-500";
}

function time(iso: string) {
  // Pinned locale + timezone so SSR HTML always matches the client render.
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  });
}

/**
 * Live operations feed. Seeded server-side, then kept current via a Supabase
 * Realtime subscription on shipment_tracking_logs INSERTs.
 */
export default function ActivityFeed({
  initial,
  live = true,
}: {
  initial: TrackingLog[];
  live?: boolean;
}) {
  const [logs, setLogs] = useState<TrackingLog[]>(initial);

  useEffect(() => {
    if (!live) return;

    const supabase = createClient();
    const channel = supabase
      .channel(uniqueChannel("dashboard-activity-feed"))
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "shipment_tracking_logs" },
        (payload) => {
          setLogs((prev) => [payload.new as TrackingLog, ...prev].slice(0, 20));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [live]);

  return (
    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
          <Radio className="w-4 h-4 text-pink-500 animate-pulse" />
          Live Operations Feed
        </h3>
        <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded font-mono">
          {live ? "Realtime Sync" : "Sample Data"}
        </span>
      </div>

      {logs.length === 0 ? (
        <p className="text-xs text-slate-400 dark:text-slate-500 py-10 text-center">
          No activity yet. Location updates and status changes will stream in
          here.
        </p>
      ) : (
        <div className="space-y-3 max-h-72 overflow-y-auto pr-1 scroll-thin">
          {logs.map((log) => (
            <div
              key={log.id}
              className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 flex items-start space-x-2.5 animate-fade-in"
            >
              <div
                className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${levelDot(
                  log.level,
                )}`}
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-800 dark:text-slate-200 leading-snug">
                  {log.message}
                </p>
                <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">
                  {time(log.created_at)} · {log.event_type}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
