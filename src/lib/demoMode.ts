import { cookies } from "next/headers";
import { DEMO_MODE_COOKIE } from "@/lib/demoModeConstants";

/** Read the current user's local sample-data preference on the server. */
export async function isDemoMode(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get(DEMO_MODE_COOKIE)?.value === "1";
}
