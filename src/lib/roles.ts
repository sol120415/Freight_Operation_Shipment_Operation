import type { AppRole } from "@/types";
import { isStaffRole } from "@/lib/rbac";

export const ALL_ROLES: AppRole[] = ["SuperAdmin", "Admin", "Seller", "Customer", "Citizen"];

/** Human-friendly aliases accepted at login/signup (case/space-insensitive). */
const ROLE_ALIASES: Record<string, AppRole> = {
  superadmin: "SuperAdmin",
  "super admin": "SuperAdmin",
  "super_admin": "SuperAdmin",
  admin: "Admin",
  administrator: "Admin",
  seller: "Seller",
  merchant: "Seller",
  vendor: "Seller",
  customer: "Customer",
  client: "Customer",
  citizen: "Citizen",
  user: "Citizen",
  "other user": "Citizen",
  other: "Citizen",
};

export function parseAppRole(value: unknown): AppRole | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (ROLE_ALIASES[normalized]) return ROLE_ALIASES[normalized];
  const match = ALL_ROLES.find((r) => r.toLowerCase() === normalized);
  return match ?? null;
}

export {
  isAdminRole,
  isSuperAdminRole,
  isStaffRole,
  isOpsStaffRole,
  isSellerRole,
  isCustomerRole,
  isCitizenRole,
  isPublicUserRole,
  can,
  canCreateParcels,
  canUpdateParcelStatus,
  roleTier,
} from "@/lib/rbac";
export type { Permission } from "@/lib/rbac";

/** Legacy aliases — kept so existing call sites continue to work.
 *  Semantics match the database helpers exactly (Admin + SuperAdmin staff). */

/** Admin or SuperAdmin — full operational writes. */
export function isStaff(role: AppRole): boolean {
  return role === "Admin" || role === "SuperAdmin";
}

/** Admin (historically included Planner; ops roles were consolidated). */
export function isOps(role: AppRole): boolean {
  return isStaffRole(role);
}

/** Maker–checker: only staff may approve/reject load plans. */
export function canApproveLoadPlans(role: AppRole): boolean {
  return isStaff(role);
}

/** Final sign-off on carrier handovers. */
export function canFinalizeHandover(role: AppRole): boolean {
  return isStaff(role);
}

/** Live tracking posts (legacy GPS feed): admin only. */
export function canPostTracking(role: AppRole): boolean {
  return isStaff(role);
}

export const OPS_ROLES: AppRole[] = ["SuperAdmin", "Admin"];
export const STAFF_ROLES: AppRole[] = ["SuperAdmin", "Admin"];
