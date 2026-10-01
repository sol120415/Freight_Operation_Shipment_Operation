"use client";

import { useEffect, useState } from "react";
import { Wifi, WifiOff, CloudUpload } from "lucide-react";
import { flushOutbox, getOutboxEntries } from "@/lib/offline/outbox";
import { useToast } from "@/components/ui/Toast";

/**
 * Connectivity guard: shows an offline banner + pending-sync count, and
 * replays the IndexedDB outbox whenever connectivity returns (online event,
 * Background Sync ping via SW message, or initial load with queued items).
 */
export default function ConnectivityGuard() {
  const toast = useToast();
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    setOnline(navigator.onLine);

    const refreshPending = async () => {
      try {
        setPending((await getOutboxEntries()).length);
      } catch {
        /* private-mode IndexedDB failures are non-fatal */
      }
    };

    const onOnline = async () => {
      setOnline(true);
      const { synced } = await flushOutbox();
      await refreshPending();
      if (synced > 0) toast.success(`${synced} offline update(s) synced`);
    };
    const onOffline = () => setOnline(false);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    void refreshPending();

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [toast]);

  if (online && pending === 0) return null;

  return (
    <div
      role="status"
      className={`fixed bottom-4 left-4 z-[800] flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold shadow-lg border transition-all ${
        online
          ? "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
          : "bg-amber-500 text-white border-amber-600 shadow-amber-500/30"
      }`}
    >
      {online ? (
        <>
          <CloudUpload className="w-3.5 h-3.5 animate-pulse" />
          {pending} update{pending === 1 ? "" : "s"} waiting to sync
        </>
      ) : (
        <>
          <WifiOff className="w-3.5 h-3.5" />
          Offline — updates will be queued
        </>
      )}
      {!online && <Wifi className="w-3.5 h-3.5 opacity-60" aria-hidden />}
    </div>
  );
}
