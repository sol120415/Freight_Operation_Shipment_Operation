import { z } from "zod";
import { DELIVERY_PLATFORMS, PICKUP_STATUSES } from "@/lib/utils";
import { SETTABLE_STATUSES } from "@/lib/parcelWorkflow";

/**
 * Canonical zod schemas for every server mutation. Mirrors the client form
 * field names exactly; server actions validate with these before touching
 * the database.
 */

const positiveNumber = (message: string) =>
  z.number({ message }).nonnegative({ message });

const nonNegativeInteger = (message: string) =>
  z.number({ message }).int(message).nonnegative({ message });

/** New parcel booking (src/app/(app)/booking). */
export const bookingSchema = z.object({
  sellerId: z.string().uuid("Select a seller"),
  idempotencyKey: z.string().uuid(),
  consignee: z.string().trim().min(2, "Recipient name is required").max(200),
  platform: z.enum(DELIVERY_PLATFORMS, {
    message: "Delivery platform is required",
  }),
  destination: z.string().trim().min(2, "Destination area is required").max(200),
  weightKg: positiveNumber("Weight must be >= 0"),
  codAmount: positiveNumber("COD amount must be >= 0"),
  serviceType: z.string().trim().max(40).default("Standard"),
  externalTrackingNumber: z.string().trim().max(80).optional().default(""),
}).superRefine((value, ctx) => {
  if (value.serviceType === "COD" && value.codAmount <= 0) {
    ctx.addIssue({
      code: "custom",
      path: ["codAmount"],
      message: "Enter a COD amount greater than zero",
    });
  }
});
export type BookingInput = z.infer<typeof bookingSchema>;

/** Seller registration (src/app/(app)/pickup). */
export const sellerSchema = z.object({
  name: z.string().trim().min(2, "Seller name is required").max(200),
  contactPerson: z.string().trim().max(120).optional().default(""),
  phone: z.string().trim().max(40).optional().default(""),
  email: z.string().trim().email().optional().or(z.literal("")).default(""),
  address: z.string().trim().max(300).optional().default(""),
  pickupFrequency: z.string().trim().max(40).optional().default("On-demand"),
});
export type SellerInput = z.infer<typeof sellerSchema>;

/** Schedule a pickup for a seller (src/app/(app)/pickup). */
export const pickupSchema = z.object({
  sellerId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
  scheduledAt: z.string().datetime(),
  expectedParcelCount: nonNegativeInteger("Expected parcel count must be a whole number >= 0"),
  notes: z.string().trim().max(500).optional().default(""),
});
export type PickupInput = z.infer<typeof pickupSchema>;

/** Bulk intake: ingest one parcel at a time from a scanning counter. */
export const parcelIntakeSchema = z.object({
  sellerId: z.string().uuid().nullable().optional(),
  idempotencyKey: z.string().uuid(),
  externalTrackingNumber: z.string().trim().max(80).optional().default(""),
  consignee: z.string().trim().max(200).optional().default(""),
  destination: z.string().trim().max(200).optional().default("Metro Manila"),
  platform: z.enum(DELIVERY_PLATFORMS),
  serviceType: z.enum(["Standard", "COD"]).default("Standard"),
  weightKg: positiveNumber("Weight must be >= 0"),
  codAmount: positiveNumber("COD amount must be >= 0"),
}).superRefine((value, ctx) => {
  if (value.serviceType === "COD" && value.codAmount <= 0) {
    ctx.addIssue({ code: "custom", path: ["codAmount"], message: "Enter a COD amount greater than zero" });
  }
});
export type ParcelIntakeInput = z.infer<typeof parcelIntakeSchema>;

/** Create a courier batch and assign parcels (src/app/(app)/manifest). */
export const batchCreateSchema = z.object({
  platform: z.enum(DELIVERY_PLATFORMS),
  parcelIds: z.array(z.string().uuid()).min(1, "Select at least one parcel"),
  idempotencyKey: z.string().uuid(),
});
export type BatchCreateInput = z.infer<typeof batchCreateSchema>;

/** Mark a batch Ready for pickup (after manifest is generated). */
export const batchReadySchema = z.object({
  batchId: z.string().uuid(),
});

/** Finalize handover to the third-party rider (src/app/(app)/handover). */
export const handoverSchema = z.object({
  batchId: z.string().uuid(),
  riderName: z.string().trim().min(2, "Rider name is required").max(200),
  riderPhone: z.string().trim().max(40).optional().default(""),
  notes: z.string().trim().max(500).optional().default(""),
});
export type HandoverInput = z.infer<typeof handoverSchema>;

/** Cancel a booking with a reason. */
export const cancelBookingSchema = z.object({
  shipmentId: z.string().uuid(),
  cancelReason: z.string().trim().min(2, "Cancellation reason is required").max(500),
});

/** Lifecycle action on a pickup request. */
export const pickupStatusSchema = z.object({
  pickupId: z.string().uuid(),
  status: z.enum(PICKUP_STATUSES),
  actualParcelCount: nonNegativeInteger("Actual parcel count must be a whole number >= 0").optional(),
}).superRefine((value, ctx) => {
  if (value.status === "Received" && value.actualParcelCount === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["actualParcelCount"],
      message: "Enter the number of parcels actually received",
    });
  }
});

/** AI routing request (legacy multimodal engine, kept for the API). */
export const routingRequestSchema = z.object({
  origin: z.string().trim().min(2).max(200),
  destination: z.string().trim().min(2).max(200),
  mode: z.enum(["Ocean", "Air", "Road", "Rail"]),
  weightKg: positiveNumber("Weight must be >= 0"),
  volumeCbm: positiveNumber("Volume must be >= 0"),
  incoterms: z.string().trim().max(40).default("FOB"),
});
export type RoutingRequestInput = z.infer<typeof routingRequestSchema>;

/** CRM purchase-order webhook payload (idempotent ingest via RPC). */
export const ingestCrmPoSchema = z.object({
  idempotencyKey: z.string().min(1).max(200),
  poNumber: z.string().min(1).max(80),
  clientName: z.string().min(1).max(200),
  vendor: z.string().max(200).optional().default(""),
  currency: z.string().max(10).default("PHP"),
  totalAmount: z.number().nonnegative().optional(),
  clientEmail: z.string().email(),
  items: z
    .array(
      z.object({
        sku: z.string().min(1).max(80),
        name: z.string().min(1).max(200),
        qtyOrdered: z.number().int().nonnegative().optional(),
        unitPrice: z.number().nonnegative().optional(),
      }),
    )
    .default([]),
  notes: z.string().max(500).optional().default(""),
});

/** House Bill / Receipt (src/app/(app)/waybill). */
export const bolSchema = z.object({
  bolNumber: z.string().trim().max(80).optional().default(""),
  bolType: z.enum(["HBL", "MBL"]),
  shipmentId: z.string().uuid().nullable().optional(),
  shipperName: z.string().trim().max(200).default(""),
  consigneeName: z.string().trim().max(200).default(""),
  notifyParty: z.string().trim().max(200).optional().default(""),
  containerNumber: z.string().trim().max(40).optional().default(""),
  sealNumber: z.string().trim().max(40).optional().default(""),
  totalWeightKg: positiveNumber("Weight must be >= 0").default(0),
  totalVolumeCbm: positiveNumber("Volume must be >= 0").default(0),
  goodsDescription: z.string().trim().max(2000).default(""),
  freightTerms: z.string().trim().max(40).default("Prepaid"),
}).superRefine((value, ctx) => {
  if (value.bolType === "MBL" && value.bolNumber.length < 4) {
    ctx.addIssue({
      code: "custom",
      path: ["bolNumber"],
      message: "Enter the MBL number issued by the ocean carrier",
    });
  }
});
export type BolInput = z.infer<typeof bolSchema>;

export const bolParseSchema = z.object({
  text: z.string().trim().min(10, "Paste enough document text to parse").max(20_000),
});

/** Validation error helper. */
export function firstZodError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input";
}

/** ----- Parcel management & tracking ----- */

const expectedDeliveryDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
    );
  }, "Use a valid calendar date");

function todayInManila(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Register a new parcel (Seller creates own; staff may pick any seller). */
export const parcelCreateSchema = z.object({
  idempotencyKey: z.string().uuid(),
  sellerId: z.string().uuid().optional().nullable(),
  customerEmail: z.string().trim().email().optional().or(z.literal("")).default(""),
  consignee: z.string().trim().min(2, "Recipient name is required").max(200),
  recipientPhone: z.string().trim().max(40).optional().default(""),
  destination: z.string().trim().min(2, "Destination is required").max(200),
  origin: z.string().trim().min(1).max(200).default("Branch Hub"),
  platform: z.enum(DELIVERY_PLATFORMS),
  externalTrackingNumber: z.string().trim().max(80).optional().default(""),
  /** Pickup or Drop-off — the seller must choose one (server-enforced). */
  deliveryMethod: z.enum(["Pickup", "Drop-off"], {
    message: "Please select Pickup or Drop-off",
  }),
  serviceType: z.string().trim().max(40).default("Standard"),
  description: z.string().trim().max(500).optional().default(""),
  dimensions: z.string().trim().max(60).optional().default(""),
  weightKg: positiveNumber("Weight must be >= 0").default(0),
  shippingFee: positiveNumber("Shipping fee must be >= 0").default(0),
  codAmount: positiveNumber("COD amount must be >= 0").default(0),
  expectedDeliveryDate: expectedDeliveryDateSchema.optional().or(z.literal("")).default(""),
}).superRefine((value, ctx) => {
  if (value.serviceType === "COD" && value.codAmount <= 0) {
    ctx.addIssue({
      code: "custom",
      path: ["codAmount"],
      message: "Enter a COD amount greater than zero",
    });
  }
  if (value.expectedDeliveryDate && value.expectedDeliveryDate < todayInManila()) {
    ctx.addIssue({
      code: "custom",
      path: ["expectedDeliveryDate"],
      message: "Expected delivery date cannot be in the past",
    });
  }
});
export type ParcelCreateInput = z.infer<typeof parcelCreateSchema>;

/** Staff-only parcel status change (drives tracking + notifications via RPC). */
export const parcelStatusSchema = z.object({
  parcelId: z.string().uuid(),
  status: z.enum(SETTABLE_STATUSES as [string, ...string[]]),
  hubId: z.string().uuid().optional().or(z.literal("")).default(""),
  location: z.string().trim().max(200).optional().default(""),
  description: z.string().trim().max(500).optional().default(""),
});

/** Admin-only current location / hub update. */
export const parcelLocationSchema = z.object({
  parcelId: z.string().uuid(),
  hubId: z.string().uuid().optional().or(z.literal("")).default(""),
  location: z.string().trim().max(200).optional().default(""),
});

/** Seller edit of own parcel details while still Registered. */
export const parcelEditSchema = z.object({
  parcelId: z.string().uuid(),
  consignee: z.string().trim().min(2).max(200),
  recipientPhone: z.string().trim().max(40).optional().default(""),
  description: z.string().trim().max(500).optional().default(""),
  weightKg: positiveNumber("Weight must be >= 0").default(0),
});

/** ----- Customer tracking links (seller-generated, revocable) ----- */

/** Generate a private tracking link for one of the seller's own parcels. */
export const trackingLinkCreateSchema = z.object({
  parcelId: z.string().uuid(),
  label: z.string().trim().max(120).optional().default(""),
  expiresInDays: z.number().int().min(1).max(365).nullable().optional().default(null),
});
export type TrackingLinkCreateInput = z.infer<typeof trackingLinkCreateSchema>;

/** Revoke one of the seller's own parcel links. */
export const trackingLinkRevokeSchema = z.object({
  linkId: z.string().uuid(),
});

/** Regenerate: revoke the previous link, then issue a fresh token. */
export const trackingLinkRegenerateSchema = z.object({
  parcelId: z.string().uuid(),
  linkId: z.string().uuid(),
  label: z.string().trim().max(120).optional().default(""),
  expiresInDays: z.number().int().min(1).max(365).nullable().optional().default(null),
});

/** ----- Seller account lifecycle (admin) ----- */

const passwordRule = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(50)
  .regex(/[a-z]/, "Must contain at least one lowercase letter")
  .regex(/[A-Z]/, "Must contain at least one uppercase letter")
  .regex(/[0-9]/, "Must contain at least one number")
  .regex(/[!@#$%^&*(),.?":{}|<>]/, "Must contain at least one special character");

export { passwordRule };

/** Create a seller with a login account. Password handled by Supabase Auth. */
export const sellerAccountSchema = sellerSchema.extend({
  businessName: z.string().trim().max(200).optional().default(""),
  password: passwordRule,
});

export const sellerUpdateSchema = z.object({
  sellerId: z.string().uuid(),
  name: z.string().trim().min(2, "Seller name is required").max(200),
  businessName: z.string().trim().max(200).optional().default(""),
  contactPerson: z.string().trim().max(120).optional().default(""),
  phone: z.string().trim().max(40).optional().default(""),
  email: z.string().trim().email().optional().or(z.literal("")).default(""),
  address: z.string().trim().max(300).optional().default(""),
  pickupFrequency: z.string().trim().max(40).optional().default("On-demand"),
  notes: z.string().trim().max(500).optional().default(""),
});

export const sellerArchiveSchema = z.object({ sellerId: z.string().uuid() });

/** Permanent delete requires the exact confirmation word typed by the admin. */
export const sellerDeleteSchema = z.object({
  sellerId: z.string().uuid(),
  confirmText: z.literal("DELETE", {
    message: 'Type DELETE to confirm permanent deletion',
  }),
});

/** ----- Hubs ----- */

export const hubSchema = z.object({
  name: z.string().trim().min(2, "Hub name is required").max(200),
  code: z.string().trim().max(20).optional().default(""),
  address: z.string().trim().max(300).optional().default(""),
  city: z.string().trim().max(100).optional().default(""),
  province: z.string().trim().max(100).optional().default(""),
  contact: z.string().trim().max(200).optional().default(""),
});
export type HubInput = z.infer<typeof hubSchema>;

export const hubUpdateSchema = hubSchema.extend({ hubId: z.string().uuid() });

/** ----- Notifications & profile ----- */

export const notificationReadSchema = z.object({
  notificationId: z.string().uuid().optional(),
  all: z.boolean().optional().default(false),
});

export const passwordChangeSchema = z.object({
  password: passwordRule,
});

/** Sign-in validation: email format + non-empty password only.
 *  No complexity rules here — those are register-only (signUpSchema). */
export const signInSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

/** Self-registration sign-up schema — SELLER ONLY.
 *  Public registration can never claim Admin/Staff roles: the role is forced
 *  to Seller server-side and is not an accepted input field. */
export const sellerNameRule = z
  .string()
  .trim()
  .min(2, "Name is required")
  .max(50, "Name must be at most 50 characters")
  .regex(
    /^[A-Za-z][A-Za-z\s.'-]*$/,
    "Name may only contain letters, spaces, hyphens, apostrophes and periods",
  );

/** Philippine mobile number: exactly 11 digits starting with 09. */
export const contactNumberRule = z
  .string()
  .trim()
  .regex(/^09\d{9}$/, "Contact number must be exactly 11 digits starting with 09 (e.g. 09XXXXXXXXX)");

export const signUpSchema = z
  .object({
    email: z.string().trim().email("Enter a valid email address"),
    password: passwordRule,
    confirmPassword: z.string(),
    fullName: sellerNameRule,
    address: z.string().trim().min(4, "Address is required").max(300),
    companyName: z.string().trim().min(2, "Company name is required").max(200),
    contactNumber: contactNumberRule,
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

/** Email OTP request / verification (passwordless login, ~90s expiry). */
export const otpRequestSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
});

export const otpVerifySchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  token: z.string().trim().min(6, "Enter the 6-digit code").max(12),
});

/** Six-digit numeric OTP code (registration + password reset). */
export const otpCodeRule = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Enter the 6-digit code sent to your email");

/** Forgot-password: request a reset OTP for a registered email. */
export const passwordResetRequestSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
});

/** Forgot-password: verify the OTP (attempt-limited, single use). */
export const passwordResetVerifySchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  token: otpCodeRule,
});

/** Forgot-password: set a new strong password with a verified OTP. */
export const passwordResetConfirmSchema = z
  .object({
    email: z.string().trim().email("Enter a valid email address"),
    token: otpCodeRule,
    newPassword: passwordRule,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

/** Reporting filters — all optional; server clamps ranges. */
export const reportFilterSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")).default(""),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")).default(""),
  status: z.string().trim().max(40).optional().default(""),
  platform: z.string().trim().max(60).optional().default(""),
  search: z.string().trim().max(120).optional().default(""),
  format: z.enum(["csv", "pdf"]).optional().default("csv"),
});
export type ReportFilterInput = z.infer<typeof reportFilterSchema>;

/** AI training example submitted from operations ("Train your AI"). */
export const aiTrainingExampleSchema = z.object({
  kind: z.enum(["routing", "bol_parse"]),
  input: z.string().trim().min(10, "Provide the original input").max(20_000),
  expectedOutput: z.string().trim().min(2, "Provide the corrected output").max(20_000),
  notes: z.string().trim().max(1000).optional().default(""),
});
export type AiTrainingExampleInput = z.infer<typeof aiTrainingExampleSchema>;

/** SuperAdmin user management — assign any canonical role. */
export const userRoleUpdateSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["SuperAdmin", "Admin", "Seller", "Customer", "Citizen"]),
});

export const userActiveToggleSchema = z.object({
  userId: z.string().uuid(),
  isActive: z.boolean(),
});
