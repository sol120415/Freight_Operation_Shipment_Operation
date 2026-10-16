import { describe, it, expect } from "vitest";
import { parseAppRole, isStaff, isOps, canApproveLoadPlans, canPostTracking } from "@/lib/roles";

describe("parseAppRole", () => {
  it("accepts only the defined enum roles", () => {
    expect(parseAppRole("SuperAdmin")).toBe("SuperAdmin");
    expect(parseAppRole("Admin")).toBe("Admin");
    expect(parseAppRole("Seller")).toBe("Seller");
    expect(parseAppRole("Customer")).toBe("Customer");
    expect(parseAppRole("Citizen")).toBe("Citizen");
    expect(parseAppRole("super admin")).toBe("SuperAdmin");
    expect(parseAppRole("other user")).toBe("Citizen");
    expect(parseAppRole("Dispatcher")).toBe("Dispatcher");
    expect(parseAppRole("OrderProcessor")).toBe("OrderProcessor");
    expect(parseAppRole("Planner")).toBeNull(); // removed role
    expect(parseAppRole("Carrier")).toBeNull(); // removed role
    expect(parseAppRole(42)).toBeNull();
    expect(parseAppRole(null)).toBeNull();
  });
});

describe("role predicates (consolidated)", () => {
  it("isStaff includes internal hub staff but excludes external accounts", () => {
    expect(isStaff("SuperAdmin")).toBe(true);
    expect(isStaff("Admin")).toBe(true);
    expect(isStaff("Dispatcher")).toBe(true);
    expect(isStaff("OrderProcessor")).toBe(true);
    expect(isStaff("ExceptionOfficer")).toBe(true);
    expect(isStaff("Courier")).toBe(false);
    expect(isStaff("Seller")).toBe(false);
    expect(isStaff("Customer")).toBe(false);
    expect(isStaff("Citizen")).toBe(false);
  });

  it("isOps is SuperAdmin + Admin after expansion", () => {
    expect(isOps("SuperAdmin")).toBe(true);
    expect(isOps("Admin")).toBe(true);
    expect(isOps("IntakeClerk")).toBe(true);
  });

  it("only staff can approve load plans", () => {
    expect(canApproveLoadPlans("SuperAdmin")).toBe(true);
    expect(canApproveLoadPlans("Admin")).toBe(true);
    expect(canApproveLoadPlans("Seller")).toBe(false);
  });

  it("tracking updates are available to supervisors and delivery users", () => {
    expect(canPostTracking("SuperAdmin")).toBe(true);
    expect(canPostTracking("Admin")).toBe(true);
    expect(canPostTracking("Courier")).toBe(true);
    expect(canPostTracking("Customer")).toBe(false);
    expect(canPostTracking("Citizen")).toBe(false);
    expect(canPostTracking("Seller")).toBe(false);
  });
});
