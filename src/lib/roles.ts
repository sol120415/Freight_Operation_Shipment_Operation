import type { AppRole } from "@/types";

export const ALL_ROLES: AppRole[] = [
  "SuperAdmin",
  "Admin",
  "OperationsSupervisor",
  "PickupCoordinator",
  "IntakeClerk",
  "OrderProcessor",
  "Dispatcher",
  "HandoverOfficer",
  "ExceptionOfficer",
  "FinanceOps",
  "DocumentOfficer",
  "CarrierRelations",
  "Courier",
  "Seller",
  "Customer",
  "Citizen",
];

/** Internal roles that work inside the hub and may see operational data. */
export const OPS_ROLES: AppRole[] = [
  "SuperAdmin",
  "Admin",
  "OperationsSupervisor",
  "PickupCoordinator",
  "IntakeClerk",
  "OrderProcessor",
  "Dispatcher",
  "HandoverOfficer",
  "ExceptionOfficer",
  "FinanceOps",
  "DocumentOfficer",
  "CarrierRelations",
];

/** Staff who use the separate Operations portal instead of Admin Command Center. */
export const OPS_STAFF_ROLES: AppRole[] = [
  "OperationsSupervisor",
  "PickupCoordinator",
  "IntakeClerk",
  "OrderProcessor",
  "Dispatcher",
  "HandoverOfficer",
  "ExceptionOfficer",
  "FinanceOps",
  "DocumentOfficer",
  "CarrierRelations",
];

/** Courier accounts are operational, but must stay scoped to assigned parcels. */
export const COURIER_ROLES: AppRole[] = ["Courier"];
export const STAFF_ROLES: AppRole[] = [...OPS_ROLES];

/** Plain-language explanation shown during user provisioning and in the UI. */
export const ROLE_DESCRIPTIONS: Record<AppRole, string> = {
  SuperAdmin: "System owner: manages users, roles, settings, and all operations.",
  Admin: "Full operations administrator kept for trusted senior staff and legacy accounts.",
  OperationsSupervisor: "Shift lead: oversees intake, dispatch, exceptions, reports, and approvals.",
  PickupCoordinator: "Schedules seller pickups and coordinates expected versus received parcels.",
  IntakeClerk: "Receives, scans, weighs, labels, and registers parcels at the hub.",
  OrderProcessor: "Owns the pending-order queue and confirms orders before hub intake.",
  Dispatcher: "Sorts parcels, creates manifests, and prepares courier dispatches.",
  HandoverOfficer: "Checks parcel count and finalizes physical handover to the courier.",
  ExceptionOfficer: "Owns delayed, failed, damaged, lost, returned, and cancelled cases.",
  FinanceOps: "Checks COD collections, remittances, fees, shortages, and seller settlements.",
  DocumentOfficer: "Prepares and checks House/Master waybills and shipment documents.",
  CarrierRelations: "Follows up courier scans, partner SLA issues, and tracking gaps.",
  Courier: "External delivery user: updates only parcels assigned to that courier account.",
  Seller: "Business sender: registers and tracks the seller's own parcels.",
  Customer: "Recipient: views and tracks parcels assigned to the customer account.",
  Citizen: "Public tracking user: views the limited shipment data assigned to the account.",
};

/** Human-friendly aliases accepted at login/signup (case/space-insensitive). */
const ROLE_ALIASES: Record<string, AppRole> = {
  superadmin: "SuperAdmin",
  "super admin": "SuperAdmin",
  "super_admin": "SuperAdmin",
  admin: "Admin",
  administrator: "Admin",
  "operations supervisor": "OperationsSupervisor",
  operationssupervisor: "OperationsSupervisor",
  "pickup coordinator": "PickupCoordinator",
  pickupcoordinator: "PickupCoordinator",
  "intake clerk": "IntakeClerk",
  intakeclerk: "IntakeClerk",
  "order processor": "OrderProcessor",
  orderprocessor: "OrderProcessor",
  dispatcher: "Dispatcher",
  "handover officer": "HandoverOfficer",
  handoverofficer: "HandoverOfficer",
  "exception officer": "ExceptionOfficer",
  exceptionofficer: "ExceptionOfficer",
  "finance ops": "FinanceOps",
  financeops: "FinanceOps",
  "document officer": "DocumentOfficer",
  documentofficer: "DocumentOfficer",
  "carrier relations": "CarrierRelations",
  carrierrelations: "CarrierRelations",
  courier: "Courier",
  rider: "Courier",
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
 *  Semantics match the database helpers exactly (all internal hub staff). */

/** Internal hub staff — operational writes, scoped by task permission. */
export function isStaff(role: AppRole): boolean {
  return STAFF_ROLES.includes(role);
}

/** Internal hub staff, excluding external seller/customer/citizen accounts. */
export function isOps(role: AppRole): boolean {
  return STAFF_ROLES.includes(role);
}

/** Maker–checker: supervisor or dispatcher may approve/reject load plans. */
export function canApproveLoadPlans(role: AppRole): boolean {
  return role === "SuperAdmin" || role === "Admin" || role === "OperationsSupervisor" || role === "Dispatcher";
}

/** Final sign-off on carrier handovers. */
export function canFinalizeHandover(role: AppRole): boolean {
  return role === "SuperAdmin" || role === "Admin" || role === "OperationsSupervisor" || role === "HandoverOfficer";
}

/** Live tracking posts: carrier relations, courier, and supervisors. */
export function canPostTracking(role: AppRole): boolean {
  return role === "SuperAdmin" || role === "Admin" || role === "OperationsSupervisor" || role === "ExceptionOfficer" || role === "CarrierRelations" || role === "Courier";
}

export function isCourierRole(role: AppRole): boolean {
  return role === "Courier";
}
