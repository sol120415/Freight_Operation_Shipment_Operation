import type { AppRole } from "@/types";

/**
 * Centralized Role-Based Access Control.
 *
 * Canonical tiers (expanded per core requirements):
 *   SUPERADMIN -> SuperAdmin (full system access + user/role management)
 *   ADMIN      -> Admin (full operations and configuration access)
 *   OPERATIONS -> task-scoped hub staff roles
 *   COURIER    -> assigned-parcel delivery updates only
 *   SELLER     -> Seller (business sender — "other user" type that ships parcels)
 *   CUSTOMER   -> Customer (recipient)
 *   CITIZEN    -> Citizen (public/citizen portal — same data tier as Customer)
 *
 * Every server action, page gate, and API route must authorize through this
 * module. The role always comes from `profiles.role` in the database
 * (see lib/auth.ts), never from user metadata or request payloads.
 */

export type Permission =
  /** View/manage all sellers: table, add/edit/archive/restore/delete. */
  | "sellers.manage"
  /** Read-only access to the customer directory. */
  | "customers.view"
  /** See parcels across the whole system. */
  | "parcels.viewAll"
  /** Register new parcels. */
  | "parcels.create"
  /** Change parcel status/location (drives tracking + notifications). */
  | "parcels.updateStatus"
  /** Move a parcel between facilities or set its operational location. */
  | "parcels.move"
  /** Register and receive parcels at the hub. */
  | "intake.manage"
  /** View the pending/confirmed order queue. */
  | "orders.viewPending"
  /** Confirm a pending order and move it into hub intake. */
  | "orders.process"
  /** Schedule and receive seller pickups. */
  | "pickup.manage"
  /** Create and manage shipment bookings. */
  | "bookings.manage"
  /** Create and ready courier manifests. */
  | "manifests.manage"
  /** View ready and completed handovers. */
  | "handover.view"
  /** Finalize a ready handover to a courier. */
  | "handover.finalize"
  /** View operational exceptions. */
  | "exceptions.view"
  /** Resolve or update operational exceptions. */
  | "exceptions.manage"
  /** View COD and settlement-related reporting. */
  | "finance.view"
  /** Create and finalize House/Master waybill records. */
  | "documents.manage"
  /** View hub/facility names without managing the master data. */
  | "hubs.view"
  /** Post GPS or partner tracking updates. */
  | "tracking.update"
  /** View parcels assigned directly to a courier account. */
  | "parcels.viewAssigned"
  /** Manage hubs/facilities. */
  | "hubs.manage"
  /** Read the audit log. */
  | "audit.view"
  /** Manage system settings. */
  | "settings.manage"
  /** Manage users & assign roles (SuperAdmin only). */
  | "users.manage"
  /** View operational reports. */
  | "reports.view"
  /** Export reports to CSV/PDF. */
  | "reports.export"
  /** View data analytics dashboards. */
  | "analytics.view"
  /** Submit training examples / run AI training jobs. */
  | "ai.train";

/** Roles with full administrative power (ops + system config). */
const ADMIN_ROLES: AppRole[] = ["SuperAdmin", "Admin"];
const OPS_LEAD_ROLES: AppRole[] = [...ADMIN_ROLES, "OperationsSupervisor"];
const INTERNAL_ROLES: AppRole[] = [
  ...OPS_LEAD_ROLES,
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

/** SuperAdmin-only powers. */
const SUPERADMIN_ROLES: AppRole[] = ["SuperAdmin"];

/** Permission matrix. One entry per permission — no scattered role checks. */
const PERMISSIONS: Record<Permission, AppRole[]> = {
  "sellers.manage": [...OPS_LEAD_ROLES, "PickupCoordinator"],
  "customers.view": [...OPS_LEAD_ROLES, "ExceptionOfficer", "CarrierRelations"],
  "parcels.viewAll": INTERNAL_ROLES,
  "parcels.create": [...OPS_LEAD_ROLES, "PickupCoordinator", "IntakeClerk", "Seller"],
  "parcels.updateStatus": [...OPS_LEAD_ROLES, "PickupCoordinator", "IntakeClerk", "OrderProcessor", "ExceptionOfficer"],
  "parcels.move": [...OPS_LEAD_ROLES, "PickupCoordinator", "IntakeClerk", "Dispatcher", "ExceptionOfficer", "CarrierRelations"],
  "intake.manage": [...OPS_LEAD_ROLES, "PickupCoordinator", "IntakeClerk"],
  "orders.viewPending": [...INTERNAL_ROLES],
  "orders.process": [...OPS_LEAD_ROLES, "OrderProcessor"],
  "pickup.manage": [...OPS_LEAD_ROLES, "PickupCoordinator", "IntakeClerk"],
  "bookings.manage": [...OPS_LEAD_ROLES, "Dispatcher", "DocumentOfficer"],
  "manifests.manage": [...OPS_LEAD_ROLES, "Dispatcher"],
  "handover.view": [...OPS_LEAD_ROLES, "HandoverOfficer", "ExceptionOfficer", "CarrierRelations"],
  "handover.finalize": [...OPS_LEAD_ROLES, "HandoverOfficer"],
  "exceptions.view": [...OPS_LEAD_ROLES, "HandoverOfficer", "ExceptionOfficer", "CarrierRelations"],
  "exceptions.manage": [...OPS_LEAD_ROLES, "ExceptionOfficer"],
  "finance.view": [...OPS_LEAD_ROLES, "FinanceOps"],
  "documents.manage": [...OPS_LEAD_ROLES, "Dispatcher", "DocumentOfficer"],
  "hubs.view": INTERNAL_ROLES,
  "tracking.update": [...OPS_LEAD_ROLES, "ExceptionOfficer", "CarrierRelations", "Courier"],
  "parcels.viewAssigned": ["Courier"],
  "hubs.manage": OPS_LEAD_ROLES,
  "audit.view": OPS_LEAD_ROLES,
  "settings.manage": ADMIN_ROLES,
  "users.manage": SUPERADMIN_ROLES,
  "reports.view": [...OPS_LEAD_ROLES, "ExceptionOfficer", "FinanceOps", "CarrierRelations"],
  "reports.export": [...OPS_LEAD_ROLES, "FinanceOps"],
  "analytics.view": [...OPS_LEAD_ROLES, "FinanceOps"],
  "ai.train": ADMIN_ROLES,
};

export function can(role: AppRole, permission: Permission): boolean {
  return PERMISSIONS[permission].includes(role);
}

/** Canonical tier label used for display + coarse gates. */
export type RoleTier = "SUPERADMIN" | "ADMIN" | "OPERATIONS" | "COURIER" | "SELLER" | "CUSTOMER" | "CITIZEN";

export function roleTier(role: AppRole): RoleTier {
  switch (role) {
    case "SuperAdmin":
      return "SUPERADMIN";
    case "Admin":
      return "ADMIN";
    case "OperationsSupervisor":
    case "PickupCoordinator":
    case "IntakeClerk":
    case "OrderProcessor":
    case "Dispatcher":
    case "HandoverOfficer":
    case "ExceptionOfficer":
    case "FinanceOps":
    case "DocumentOfficer":
    case "CarrierRelations":
      return "OPERATIONS";
    case "Courier":
      return "COURIER";
    case "Seller":
      return "SELLER";
    case "Citizen":
      return "CITIZEN";
    case "Customer":
      return "CUSTOMER";
  }
}

export function isSuperAdminRole(role: AppRole): boolean {
  return role === "SuperAdmin";
}

export function isAdminRole(role: AppRole): boolean {
  // Admin gates intentionally include SuperAdmin (privilege superset).
  return role === "Admin" || role === "SuperAdmin";
}

/** Any internal account allowed into the operations data tier. */
export function isStaffRole(role: AppRole): boolean {
  return INTERNAL_ROLES.includes(role);
}

export function isOpsStaffRole(role: AppRole): boolean {
  return INTERNAL_ROLES.includes(role) && !isAdminRole(role);
}

export function isCourierRole(role: AppRole): boolean {
  return role === "Courier";
}

/** Seller-tier account (sends parcels through the hub). */
export function isSellerRole(role: AppRole): boolean {
  return role === "Seller";
}

/** Customer-tier account (receives parcels). */
export function isCustomerRole(role: AppRole): boolean {
  return role === "Customer";
}

/** Citizen portal account — same data tier as Customer (own shipments only). */
export function isCitizenRole(role: AppRole): boolean {
  return role === "Citizen";
}

/** Any "other user" / public tier: Customer or Citizen (own data only). */
export function isPublicUserRole(role: AppRole): boolean {
  return role === "Customer" || role === "Citizen";
}

export function canCreateParcels(role: AppRole): boolean {
  return can(role, "parcels.create");
}

export function canUpdateParcelStatus(role: AppRole): boolean {
  return can(role, "parcels.updateStatus");
}
