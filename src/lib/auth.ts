import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  can,
  type Permission,
  isSellerRole,
  isCustomerRole,
} from "@/lib/rbac";
import type { AppRole, Profile, Seller } from "@/types";

export {
  ALL_ROLES,
  parseAppRole,
  isStaff,
  isOps,
  canApproveLoadPlans,
  canPostTracking,
  canFinalizeHandover,
} from "@/lib/roles";
export {
  can,
  roleTier,
  isAdminRole,
  isSuperAdminRole,
  isStaffRole,
  isSellerRole,
  isCustomerRole,
  isCitizenRole,
  isPublicUserRole,
  type Permission,
} from "@/lib/rbac";

/**
 * Resolve the signed-in user's profile for Server Components.
 * Authorization uses profiles.role only — never user_metadata for gates.
 */
export async function requireProfile(): Promise<Profile> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (profile) {
    // Deactivated users are refused at the app layer too (RLS also locks them
    // out via current_role() → NULL). The role always comes from the DB row;
    // user_metadata is never trusted for authorization.
    if (profile.is_active === false) redirect("/login");
    return profile;
  }

  return {
    id: user.id,
    email: user.email ?? null,
    full_name: (user.user_metadata?.full_name as string) ?? user.email ?? null,
    role: "Customer",
    org_name: null,
    is_active: true,
    invited_by: null,
    seller_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/** Guard a page/action to a set of roles; redirect to /dashboard otherwise. */
export async function requireRole(roles: AppRole[]): Promise<Profile> {
  const profile = await requireProfile();
  if (!roles.includes(profile.role)) redirect("/forbidden");
  return profile;
}

/**
 * Central permission gate for pages and server actions. The permission check
 * runs against the DB-backed profile — a forged client role cannot pass.
 * Unauthorized users are redirected to /forbidden (403-equivalent for pages).
 */
export async function requirePermission(
  permission: Permission,
): Promise<Profile> {
  const profile = await requireProfile();
  if (!can(profile.role, permission)) redirect("/forbidden");
  return profile;
}

/** Non-redirecting variant for API routes / actions returning ActionResult. */
export async function checkPermission(
  permission: Permission,
): Promise<{ profile: Profile } | { error: "forbidden" }> {
  const profile = await requireProfile();
  return can(profile.role, permission)
    ? { profile }
    : { error: "forbidden" };
}

export interface SellerContext {
  profile: Profile;
  /** The sellers row owned by this profile (Seller role only). */
  seller: Seller | null;
}

/**
 * Resolve the signed-in Seller's linked business record. Sellers without a
 * linked seller record cannot transact until an admin links one.
 */
export async function getSellerContext(): Promise<SellerContext | null> {
  const profile = await requireProfile();
  if (!isSellerRole(profile.role)) return null;

  let seller: Seller | null = null;
  if (profile.seller_id) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("sellers")
      .select("*")
      .eq("id", profile.seller_id)
      .maybeSingle();
    seller = (data as Seller) ?? null;
  }
  return { profile, seller };
}

export async function isCustomer(): Promise<boolean> {
  const profile = await requireProfile();
  return isCustomerRole(profile.role);
}
