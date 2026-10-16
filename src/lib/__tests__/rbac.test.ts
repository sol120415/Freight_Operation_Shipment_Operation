import { describe, it, expect } from "vitest";
import {
  can,
  roleTier,
  isAdminRole,
  isSuperAdminRole,
  isStaffRole,
  isOpsStaffRole,
  isSellerRole,
  isCustomerRole,
  isCitizenRole,
  isPublicUserRole,
} from "@/lib/rbac";
import { parseAppRole } from "@/lib/roles";

describe("rbac permission matrix", () => {
  it("admin has every ops permission", () => {
    expect(can("Admin", "sellers.manage")).toBe(true);
    expect(can("Admin", "audit.view")).toBe(true);
    expect(can("Admin", "settings.manage")).toBe(true);
    expect(can("Admin", "parcels.updateStatus")).toBe(true);
    expect(can("Admin", "parcels.create")).toBe(true);
    expect(can("Admin", "hubs.manage")).toBe(true);
    expect(can("Admin", "reports.view")).toBe(true);
    expect(can("Admin", "reports.export")).toBe(true);
    expect(can("Admin", "analytics.view")).toBe(true);
    expect(can("Admin", "ai.train")).toBe(true);
    // Only SuperAdmin manages users/roles.
    expect(can("Admin", "users.manage")).toBe(false);
  });

  it("superadmin inherits admin powers plus user management", () => {
    expect(can("SuperAdmin", "sellers.manage")).toBe(true);
    expect(can("SuperAdmin", "parcels.viewAll")).toBe(true);
    expect(can("SuperAdmin", "users.manage")).toBe(true);
    expect(can("SuperAdmin", "reports.export")).toBe(true);
    expect(can("SuperAdmin", "ai.train")).toBe(true);
  });

  it("task roles only receive the permissions they need", () => {
    expect(can("IntakeClerk", "intake.manage")).toBe(true);
    expect(can("OrderProcessor", "orders.viewPending")).toBe(true);
    expect(can("OrderProcessor", "orders.process")).toBe(true);
    expect(can("OrderProcessor", "settings.manage")).toBe(false);
    expect(can("IntakeClerk", "manifests.manage")).toBe(false);
    expect(can("Dispatcher", "manifests.manage")).toBe(true);
    expect(can("Dispatcher", "handover.finalize")).toBe(false);
    expect(can("HandoverOfficer", "handover.finalize")).toBe(true);
    expect(can("HandoverOfficer", "manifests.manage")).toBe(false);
    expect(can("ExceptionOfficer", "exceptions.manage")).toBe(true);
    expect(can("FinanceOps", "finance.view")).toBe(true);
    expect(can("FinanceOps", "settings.manage")).toBe(false);
    expect(can("DocumentOfficer", "documents.manage")).toBe(true);
    expect(can("Courier", "parcels.viewAssigned")).toBe(true);
    expect(can("Courier", "parcels.viewAll")).toBe(false);
  });

  it("sellers can create parcels but never manage the system", () => {
    expect(can("Seller", "parcels.create")).toBe(true);
    expect(can("Seller", "sellers.manage")).toBe(false);
    expect(can("Seller", "customers.view")).toBe(false);
    expect(can("Seller", "audit.view")).toBe(false);
    expect(can("Seller", "settings.manage")).toBe(false);
    expect(can("Seller", "hubs.manage")).toBe(false);
    expect(can("Seller", "parcels.updateStatus")).toBe(false);
  });

  it("customers and citizens have no administrative permissions at all", () => {
    const adminOnly = [
      "sellers.manage",
      "customers.view",
      "parcels.viewAll",
      "parcels.updateStatus",
      "hubs.manage",
      "audit.view",
      "settings.manage",
      "parcels.create",
      "users.manage",
      "reports.view",
      "reports.export",
      "analytics.view",
      "ai.train",
    ] as const;
    for (const perm of adminOnly) {
      expect(can("Customer", perm)).toBe(false);
      expect(can("Citizen", perm)).toBe(false);
    }
  });

  it("citizen shares the public tier with customer", () => {
    expect(isCitizenRole("Citizen")).toBe(true);
    expect(isPublicUserRole("Citizen")).toBe(true);
    expect(isPublicUserRole("Customer")).toBe(true);
    expect(isPublicUserRole("Seller")).toBe(false);
    expect(roleTier("Citizen")).toBe("CITIZEN");
    expect(roleTier("SuperAdmin")).toBe("SUPERADMIN");
  });

  it("legacy carrier/planner roles stay rejected while dispatcher is active", () => {
    // "Client" is a legacy alias that now resolves to the Customer tier;
    // truly removed operational roles stay rejected.
    expect(parseAppRole("Carrier")).toBeNull();
    expect(parseAppRole("Dispatcher")).toBe("Dispatcher");
    expect(parseAppRole("Planner")).toBeNull();
    expect(roleTier("Admin")).toBe("ADMIN");
    expect(roleTier("Dispatcher")).toBe("OPERATIONS");
    expect(roleTier("Courier")).toBe("COURIER");
    expect(roleTier("Seller")).toBe("SELLER");
    expect(roleTier("Customer")).toBe("CUSTOMER");
  });
});

describe("role tiers & predicates", () => {
  it("maps roles onto canonical tiers", () => {
    expect(roleTier("SuperAdmin")).toBe("SUPERADMIN");
    expect(roleTier("Admin")).toBe("ADMIN");
    expect(roleTier("Seller")).toBe("SELLER");
    expect(roleTier("Customer")).toBe("CUSTOMER");
    expect(roleTier("Citizen")).toBe("CITIZEN");
  });

  it("predicates are exact-match on the canonical roles", () => {
    expect(isCustomerRole("Customer")).toBe(true);
    expect(isCustomerRole("Seller")).toBe(false);
    expect(isSellerRole("Seller")).toBe(true);
    expect(isAdminRole("Admin")).toBe(true);
    // SuperAdmin inherits admin gates (superset privilege).
    expect(isAdminRole("SuperAdmin")).toBe(true);
    expect(isSuperAdminRole("SuperAdmin")).toBe(true);
    expect(isSuperAdminRole("Admin")).toBe(false);
    expect(isStaffRole("Admin")).toBe(true);
    expect(isStaffRole("SuperAdmin")).toBe(true);
    expect(isOpsStaffRole("Admin")).toBe(false);
    expect(isOpsStaffRole("OrderProcessor")).toBe(true);
    // Canonical roles parse; old Carrier/Planner labels are rejected.
    for (const r of ["SuperAdmin", "Admin", "OperationsSupervisor", "PickupCoordinator", "IntakeClerk", "OrderProcessor", "Dispatcher", "HandoverOfficer", "ExceptionOfficer", "FinanceOps", "DocumentOfficer", "CarrierRelations", "Courier", "Seller", "Customer", "Citizen"] as const) {
      expect(parseAppRole(r)).toBe(r);
    }
    // Human aliases resolve to canonical roles.
    expect(parseAppRole("super admin")).toBe("SuperAdmin");
    expect(parseAppRole("citizen")).toBe("Citizen");
    expect(parseAppRole("other user")).toBe("Citizen");
    expect(parseAppRole("Planner")).toBeNull();
    expect(parseAppRole("Carrier")).toBeNull();
  });
});
