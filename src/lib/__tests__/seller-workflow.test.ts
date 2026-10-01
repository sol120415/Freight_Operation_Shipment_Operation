import { describe, it, expect } from "vitest";
import {
  parcelCreateSchema,
  bookingSchema,
  signUpSchema,
  passwordResetConfirmSchema,
} from "@/lib/validation/schemas";
import {
  isAllowedTransition,
  transitionError,
  allowedNextStatuses,
  handoverMessage,
  DELIVERY_METHODS,
} from "@/lib/parcelWorkflow";
import { isValidSellerName, isValidContactNumber, passwordChecks } from "@/lib/sellerValidation";
import { buildOtpEmail } from "@/lib/otp";

const parcelBase = {
  consignee: "Juan Dela Cruz",
  destination: "Quezon City",
  platform: "J&T Express",
  deliveryMethod: "Pickup",
} as const;

describe("parcel registration delivery method", () => {
  it("requires Pickup or Drop-off", () => {
    expect(parcelCreateSchema.safeParse(parcelBase).success).toBe(true);
    expect(
      parcelCreateSchema.safeParse({ ...parcelBase, deliveryMethod: "Drop-off" }).success,
    ).toBe(true);
    const missing = parcelCreateSchema.safeParse({
      consignee: "Juan",
      destination: "Manila",
      platform: "J&T Express",
    });
    expect(missing.success).toBe(false);
    const bad = parcelCreateSchema.safeParse({ ...parcelBase, deliveryMethod: "Drone" });
    expect(bad.success).toBe(false);
  });

  it("rejects invalid or past expected delivery dates", () => {
    expect(
      parcelCreateSchema.safeParse({ ...parcelBase, expectedDeliveryDate: "2020-01-01" }).success,
    ).toBe(false);
    expect(
      parcelCreateSchema.safeParse({ ...parcelBase, expectedDeliveryDate: "2026-02-31" }).success,
    ).toBe(false);
  });

  it("exposes exactly the two allowed methods", () => {
    expect(DELIVERY_METHODS).toEqual(["Pickup", "Drop-off"]);
  });
});

describe("booking form/server contract", () => {
  it("accepts the fields the booking form actually submits", () => {
    const result = bookingSchema.safeParse({
      clientName: "TEST Seller Alpha",
      consignee: "TEST Recipient 001",
      platform: "J&T Express",
      destination: "Quezon City",
      weightKg: 0,
      codAmount: 0,
      serviceType: "Standard",
      trackingNumber: "",
    });
    expect(result.success).toBe(true);
  });
});

describe("seller registration validation", () => {
  const valid = {
    email: "seller@example.com",
    password: "Example@123",
    confirmPassword: "Example@123",
    fullName: "Daniella Sophia Amora",
    address: "123 Escolta St, Binondo, Manila",
    companyName: "Amora Online Shop",
    contactNumber: "09171234567",
  };

  it("accepts a valid seller form", () => {
    expect(signUpSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects names with numbers or over 50 characters", () => {
    expect(signUpSchema.safeParse({ ...valid, fullName: "Seller123" }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...valid, fullName: "A".repeat(51) }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...valid, fullName: "A" }).success).toBe(false);
    expect(isValidSellerName("Maria Dela Cruz")).toBe(true);
    expect(isValidSellerName("Seller123")).toBe(false);
    expect(isValidSellerName("A".repeat(51))).toBe(false);
  });

  it("rejects contact numbers that are not 11-digit 09… numbers", () => {
    for (const bad of ["123", "0917123456", "091712345678", "abcdefghijk", "0917-123-456", "+639171234567"]) {
      expect(signUpSchema.safeParse({ ...valid, contactNumber: bad }).success).toBe(false);
      expect(isValidContactNumber(bad)).toBe(false);
    }
    expect(isValidContactNumber("09171234567")).toBe(true);
    expect(isValidContactNumber("09981234567")).toBe(true);
  });

  it("rejects duplicate-role escalation (no role field accepted)", () => {
    const parsed = signUpSchema.safeParse({ ...valid, role: "Admin" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).not.toHaveProperty("role");
    }
  });

  it("rejects weak passwords and enforces the strong-password checklist", () => {
    expect(passwordChecks("Example@123").every((c) => c.ok)).toBe(true);
    for (const weak of ["short1!", "nouppercase@123", "NOLOWERCASE@123", "NoNumber!@", "NoSpecial123"]) {
      expect(signUpSchema.safeParse({ ...valid, password: weak, confirmPassword: weak }).success).toBe(false);
    }
  });

  it("rejects duplicate / invalid emails", () => {
    expect(signUpSchema.safeParse({ ...valid, email: "not-an-email" }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...valid, address: "" }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...valid, companyName: "" }).success).toBe(false);
  });
});

describe("forgot-password reset validation", () => {
  it("requires a verified OTP plus matching strong passwords", () => {
    const good = {
      email: "seller@example.com",
      token: "123456",
      newPassword: "Example@123",
      confirmPassword: "Example@123",
    };
    expect(passwordResetConfirmSchema.safeParse(good).success).toBe(true);
    expect(
      passwordResetConfirmSchema.safeParse({ ...good, token: "12" }).success,
    ).toBe(false);
    expect(
      passwordResetConfirmSchema.safeParse({ ...good, newPassword: "weak" }).success,
    ).toBe(false);
    expect(
      passwordResetConfirmSchema.safeParse({ ...good, confirmPassword: "Other@123" }).success,
    ).toBe(false);
  });
});

describe("admin parcel workflow guard", () => {
  it("allows the happy path Registered → Received → Booked → Manifested → Handed Over → Transit → Delivered", () => {
    const path: [string, string][] = [
      ["Registered", "Dropped Off"],
      ["Dropped Off", "Booked"],
      ["Booked", "Batched"],
      ["Batched", "Handed Over"],
      ["Handed Over", "In Transit"],
      ["In Transit", "At Destination Hub"],
      ["At Destination Hub", "Out for Delivery"],
      ["Out for Delivery", "Delivered"],
    ];
    for (const [from, to] of path) {
      expect(transitionError(from, to)).toBeNull();
      expect(isAllowedTransition(from, to)).toBe(true);
    }
  });

  it("blocks skipping required steps", () => {
    expect(isAllowedTransition("Registered", "Batched")).toBe(false);
    expect(isAllowedTransition("Registered", "Handed Over")).toBe(false);
    expect(isAllowedTransition("Registered", "In Transit")).toBe(false);
    expect(isAllowedTransition("Registered", "Delivered")).toBe(false);
    expect(isAllowedTransition("Batched", "In Transit")).toBe(false);
    expect(isAllowedTransition("Booked", "Delivered")).toBe(false);
  });

  it("blocks backward moves once the parcel left the hub", () => {
    expect(isAllowedTransition("In Transit", "Registered")).toBe(false);
    expect(isAllowedTransition("Out for Delivery", "Batched")).toBe(false);
    expect(isAllowedTransition("Delivered", "In Transit")).toBe(false);
  });

  it("still allows exception states and same-status location updates", () => {
    expect(isAllowedTransition("Registered", "Cancelled")).toBe(true);
    expect(isAllowedTransition("In Transit", "Delivery Failed")).toBe(true);
    expect(transitionError("In Transit", "In Transit")).not.toBeNull();
    expect(allowedNextStatuses("Batched")).toContain("Handed Over");
    expect(allowedNextStatuses("Batched")).not.toContain("In Transit");
    expect(allowedNextStatuses("Batched")).not.toContain("Delivered");
  });

  it("builds the required seller handover notification text", () => {
    const msg = handoverMessage("PKG-2026-000001");
    expect(msg).toBe(
      "Your parcel PKG-2026-000001 has been successfully handed over to our delivery partner.",
    );
  });
});

describe("OTP email templates", () => {
  it("registration email has the required subject and content", () => {
    const m = buildOtpEmail("123456", "seller_registration", "Maria Dela Cruz");
    expect(m.subject).toBe("Verify Your Seller Account");
    expect(m.text).toContain("Maria Dela Cruz");
    expect(m.text).toContain("123456");
    expect(m.text).toContain("10 minutes");
    expect(m.text).toContain("never share this code");
    expect(m.text).toContain("safely ignore");
    expect(m.html).toContain("123456");
    // Never ships a password inside a verification email.
    expect(m.text).not.toMatch(/password\s*[:=]/i);
  });

  it("password-reset email has the required subject and content", () => {
    const m = buildOtpEmail("654321", "password_reset");
    expect(m.subject).toBe("Password Reset Verification Code");
    expect(m.text).toContain("654321");
    expect(m.text).toContain("10 minutes");
    expect(m.text).toContain("If you did not request this, you can safely ignore this email.");
    expect(m.html).toContain("654321");
  });

  it("escapes the seller name in the HTML body", () => {
    const m = buildOtpEmail("123456", "seller_registration", "<script>alert(1)</script>");
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;");
  });
});
