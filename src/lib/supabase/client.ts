import { createBrowserClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Browser Supabase client. Safe to use in Client Components — only ever
 * carries the public anon key. Use for Realtime subscriptions and
 * user-scoped reads/writes (RLS enforces access).
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

/**
 * Client used only by the password-recovery page. Recovery links generated
 * by the server use Supabase's implicit recovery redirect, while the normal
 * application client stays on the SSR/PKCE flow. This intentionally uses the
 * base Supabase browser client because createBrowserClient always uses PKCE.
 */
export function createRecoveryClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        flowType: "implicit",
        detectSessionInUrl: true,
      },
    },
  );
}

/**
 * Unique Realtime channel name per mount. Supabase dedupes channels by name:
 * in React Strict Mode the effect mounts twice, and reusing a fixed name on
 * the second mount returns the already-subscribed channel — calling
 * `.on()`/`.subscribe()` on it throws ("...after subscribe()"). A per-call
 * suffix guarantees a fresh channel object every time.
 */
export function uniqueChannel(base: string): string {
  return `${base}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
}
