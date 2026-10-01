import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getUnreadCount } from "@/lib/repos/notifications";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import ConnectivityGuard from "@/components/pwa/ConnectivityGuard";
import SessionTimeoutProvider from "@/components/auth/SessionTimeoutProvider";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const [batchCount, unreadNotifications] = await Promise.all([
    // Ops-only metric; other roles simply get zero from RLS.
    supabase
      .from("carrier_batches")
      .select("*", { count: "exact", head: true })
      .not("status", "eq", "Handed Over"),
    getUnreadCount(),
  ]);

  return (
    <SessionTimeoutProvider>
      <div className="flex h-screen bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-200 antialiased overflow-hidden">
        <Sidebar
          role={profile.role}
          pendingBatchCount={batchCount.count ?? 0}
          unreadNotifications={unreadNotifications}
        />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-50 dark:bg-slate-900">
          <Header profile={profile} unreadCount={unreadNotifications} />
          <main className="flex-1 overflow-y-auto p-6 scroll-thin">{children}</main>
          <ConnectivityGuard />
        </div>
      </div>
    </SessionTimeoutProvider>
  );
}
