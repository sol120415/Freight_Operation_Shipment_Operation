import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getUnreadCount } from "@/lib/repos/notifications";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import ConnectivityGuard from "@/components/pwa/ConnectivityGuard";
import SessionTimeoutProvider from "@/components/auth/SessionTimeoutProvider";
import { isDemoMode } from "@/lib/demoMode";
import { DEMO_BATCHES } from "@/lib/demoData";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();
  const demoMode = await isDemoMode();

  let pendingBatchCount = 0;
  let unreadNotifications = 0;

  if (demoMode) {
    pendingBatchCount = DEMO_BATCHES.filter((batch) => batch.status !== "Handed Over").length;
  } else {
    const supabase = await createClient();
    const [batchCount, unreadCount] = await Promise.all([
      // Ops-only metric; other roles simply get zero from RLS.
      supabase
        .from("carrier_batches")
        .select("*", { count: "exact", head: true })
        .not("status", "eq", "Handed Over"),
      getUnreadCount(),
    ]);
    pendingBatchCount = batchCount.count ?? 0;
    unreadNotifications = unreadCount;
  }

  return (
    <SessionTimeoutProvider>
      <div className="flex h-screen bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-200 antialiased overflow-hidden">
        <Sidebar
          role={profile.role}
          pendingBatchCount={pendingBatchCount}
        />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-50 dark:bg-slate-900">
          <Header profile={profile} unreadCount={unreadNotifications} demoMode={demoMode} />
          <main className="flex-1 overflow-y-auto p-6 scroll-thin">
            {demoMode && (
              <div className="max-w-7xl mx-auto mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                <span className="mt-0.5 text-sm" aria-hidden="true">🧪</span>
                <div className="min-w-0">
                  <p className="text-xs font-bold">Demo Mode is on</p>
                  <p className="mt-0.5 text-[11px] text-amber-800/80 dark:text-amber-200/80">
                    You are viewing sample records. Turn this off before creating or editing live records.
                  </p>
                </div>
              </div>
            )}
            {children}
          </main>
          <ConnectivityGuard />
        </div>
      </div>
    </SessionTimeoutProvider>
  );
}
