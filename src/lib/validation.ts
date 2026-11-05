import { z } from "zod";
import { BRANCH_TYPES, STAFF_ROLES } from "./org";
import { services } from "./services";

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

/** POST /api/auth/reset body (P0 password reset). */
export const passwordResetRequestSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid email address"),
});

/** /reset-password form: the new password + confirmation (P0). */
export const newPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(72, "Password must be at most 72 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, "Enter your full name"),
    email: z.string().email("Enter a valid email address"),
    phone: z
      .string()
      .trim()
      .regex(/^[+]?[\d\s-]{10,15}$/, "Enter a valid phone number"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(72, "Password must be at most 72 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const contactSchema = z.object({
  name: z.string().trim().min(2, "Enter your name"),
  email: z.string().email("Enter a valid email address"),
  phone: z
    .string()
    .trim()
    .regex(/^[+]?[\d\s-]{10,15}$/, "Enter a valid phone number")
    .optional()
    .or(z.literal("")),
  message: z.string().trim().min(10, "Tell us a little more (10+ characters)"),
});

const indianPhone = z
  .string()
  .trim()
  .regex(/^(\+91[\s-]?)?[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number");

const pincode = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Enter a valid 6-digit pincode");

export const PICKUP_SLOTS = [
  "9 AM – 11 AM",
  "11 AM – 1 PM",
  "1 PM – 3 PM",
  "3 PM – 5 PM",
  "5 PM – 7 PM",
  "7 PM – 9 PM",
] as const;

export const pickupRequestSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name"),
  phone: indianPhone,
  addressLine: z.string().trim().min(8, "Enter your full address (house no., street)"),
  area: z.string().trim().min(2, "Select your area"),
  city: z.string().trim().min(2, "Enter your city"),
  pincode,
  services: z
    .array(z.string().trim().min(1))
    .min(1, "Select at least one service"),
  pickupDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a pickup date")
    .refine((d) => {
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      return d >= todayStr;
    }, "Pickup date cannot be in the past"),
  pickupSlot: z.enum(PICKUP_SLOTS, { message: "Select a pickup time slot" }),
  deliveryType: z.enum(["regular", "express"]),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});

/* ------------------------------------------------------------------ */
/* Phase 3 — orders                                                    */
/* ------------------------------------------------------------------ */

export const orderItemSchema = z.object({
  serviceSlug: z.string().trim().min(1),
  itemName: z.string().trim().min(1).max(120),
  qty: z.number().positive("Quantity must be more than 0").max(10000),
});

export const orderSchema = z.object({
  // Customer + pickup details (same rules as a pickup request).
  name: z.string().trim().min(2, "Enter your full name"),
  phone: indianPhone,
  addressLine: z.string().trim().min(8, "Enter your full address (house no., street)"),
  area: z.string().trim().min(2, "Select your area"),
  city: z.string().trim().min(2, "Enter your city"),
  pincode,
  pickupDate: pickupRequestSchema.shape.pickupDate,
  pickupSlot: z.enum(PICKUP_SLOTS, { message: "Select a pickup time slot" }),
  deliveryType: z.enum(["regular", "express"]),
  note: z.string().trim().max(500).optional().or(z.literal("")),
  // Order contents + payment.
  items: z.array(orderItemSchema).min(1, "Add at least one item to your order"),
  paymentMethod: z.enum(["razorpay", "cod"]),
  couponCode: z
    .string()
    .trim()
    .max(20)
    .optional()
    .or(z.literal("")),
  /**
   * Gift voucher / prepaid card code (Phase 7b). A voucher and a coupon
   * may NOT stack — the route rejects both-together with 422
   * VOUCHER_COUPON_CONFLICT. The voucher is validated and applied
   * entirely on the server AFTER the base-total integrity check, so it
   * never enters the client-computed expectedTotalPaise.
   */
  voucherCode: z
    .string()
    .trim()
    .max(30)
    .optional()
    .or(z.literal("")),
  /**
   * The total the client computed with the shared totals engine. The server
   * re-calculates from catalogue data and REJECTS the order when this does
   * not match — client totals are never trusted.
   */
  expectedTotalPaise: z.number().int().nonnegative(),
});

export type OrderItemInputApi = z.infer<typeof orderItemSchema>;
export type OrderInput = z.infer<typeof orderSchema>;

export const addressSchema = z.object({
  label: z.string().trim().min(1, "Give this address a label").max(30),
  line: z.string().trim().min(8, "Enter the full address (house no., street)"),
  area: z.string().trim().min(2, "Select your area"),
  city: z.string().trim().min(2, "Enter your city"),
  pincode,
});

export type PickupRequestInput = z.infer<typeof pickupRequestSchema>;
export type AddressInput = z.infer<typeof addressSchema>;

/**
 * Admin status update (Phase 4) — PATCH /api/admin/orders/[id]/status.
 * `status` is the requested NEW status (must be a legal next step per
 * src/lib/order-flow.ts — the route validates the transition itself and
 * answers 422 for illegal moves). Omit `status` (or send the current
 * one) only together with `codCollected: true` to record a Pay-on-
 * Delivery collection without a status change.
 */
export const adminStatusUpdateSchema = z.object({
  status: z.string().trim().min(1).max(40).optional(),
  note: z.string().trim().max(500).optional().or(z.literal("")),
  codCollected: z.boolean().optional(),
});

export type AdminStatusUpdateInput = z.infer<typeof adminStatusUpdateSchema>;

/* ------------------------------------------------------------------ */
/* Phase 7a — organisation (branches & employees). The role/type lists */
/* come from the permission matrix in src/lib/org.ts so the API, the   */
/* database check constraints and the UI can never drift apart.        */
/* ------------------------------------------------------------------ */

const staffRoleEnum = z.enum(
  STAFF_ROLES.map((r) => r.role) as [string, ...string[]],
);
const branchTypeEnum = z.enum(
  BRANCH_TYPES.map((t) => t.value) as [string, ...string[]],
);
const optionalPincode = pincode.optional().or(z.literal(""));
const optionalEmail = z
  .string()
  .trim()
  .email("Enter a valid email address")
  .optional()
  .or(z.literal(""));
const optionalUuid = z.string().uuid().nullable().optional();

export const branchCreateSchema = z.object({
  name: z.string().trim().min(2, "Enter the branch / plant / center name").max(120),
  type: branchTypeEnum,
  address: z.string().trim().max(300).optional().or(z.literal("")),
  area: z.string().trim().max(120).optional().or(z.literal("")),
  pincode: optionalPincode,
  managerEmployeeId: optionalUuid,
  active: z.boolean().optional(),
});

export const branchUpdateSchema = branchCreateSchema.partial();

export type BranchCreateInput = z.infer<typeof branchCreateSchema>;
export type BranchUpdateInput = z.infer<typeof branchUpdateSchema>;

export const employeeCreateSchema = z.object({
  employeeCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9-]{2,19}$/, "Use letters, numbers and dashes (e.g. ZC-EMP-0001)")
    .optional()
    .or(z.literal("")),
  fullName: z.string().trim().min(2, "Enter the employee's full name").max(120),
  phone: indianPhone,
  email: optionalEmail,
  userId: optionalUuid,
  branchId: optionalUuid,
  managerId: optionalUuid,
  joiningDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid joining date (YYYY-MM-DD)")
    .optional()
    .or(z.literal("")),
  employmentStatus: z.enum(["active", "inactive"]).optional(),
  roles: z.array(staffRoleEnum).min(1, "Assign at least one role"),
});

export const employeeUpdateSchema = employeeCreateSchema.partial().extend({
  // Roles stay optional on update, but when sent they replace the set —
  // and a replacement set must still contain at least one role.
  roles: z.array(staffRoleEnum).min(1, "Assign at least one role").optional(),
});

export type EmployeeCreateInput = z.infer<typeof employeeCreateSchema>;
export type EmployeeUpdateInput = z.infer<typeof employeeUpdateSchema>;

/* ------------------------------------------------------------------ */
/* Phase 7b — gift vouchers, pricing editor, settings editor.          */
/* Money crosses the API in integer paise (the UI converts ₹ → paise). */
/* ------------------------------------------------------------------ */

const serviceSlugEnum = z.enum(
  services.map((s) => s.slug) as [string, ...string[]],
);
const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date (YYYY-MM-DD)")
  .nullable()
  .optional();

export const voucherCreateSchema = z
  .object({
    kind: z.enum(["prepaid_card", "promo"]),
    /** Campaign batch size: this many codes with identical terms. */
    quantity: z.number().int().min(1).max(50).optional(),
    // Prepaid card terms.
    faceValuePaise: z.number().int().positive().max(100_000_00).optional(),
    // Promo terms.
    discountType: z.enum(["fixed", "percent"]).optional(),
    /** Paise when fixed; whole percent (1–100) when percent. */
    discountValue: z.number().int().positive().max(100_000_00).optional(),
    maxDiscountPaise: z.number().int().nonnegative().max(100_000_00).nullable().optional(),
    // Shared rules.
    minOrderPaise: z.number().int().nonnegative().max(100_000_00).optional(),
    eligibleServices: z.array(serviceSlugEnum).max(services.length).optional(),
    branchId: optionalUuid,
    usageLimit: z.number().int().min(1).max(1000).optional(),
    validFrom: optionalDate,
    validUntil: optionalDate,
  })
  .refine(
    (v) => v.kind !== "prepaid_card" || (v.faceValuePaise ?? 0) > 0,
    { message: "A gift card needs a face value.", path: ["faceValuePaise"] },
  )
  .refine(
    (v) =>
      v.kind !== "promo" ||
      (v.discountType !== undefined && (v.discountValue ?? 0) > 0),
    { message: "A promo voucher needs a discount type and value.", path: ["discountValue"] },
  )
  .refine(
    (v) =>
      v.kind !== "promo" ||
      v.discountType !== "percent" ||
      (v.discountValue ?? 0) <= 100,
    { message: "A percent discount cannot exceed 100%.", path: ["discountValue"] },
  )
  .refine(
    (v) =>
      !v.validFrom || !v.validUntil || v.validFrom <= v.validUntil,
    { message: "The validity start must be on or before the end date.", path: ["validUntil"] },
  );

export type VoucherCreateInput = z.infer<typeof voucherCreateSchema>;

export const voucherActionSchema = z.object({
  action: z.enum(["issue", "cancel", "expire"]),
  issuedToName: z.string().trim().min(2).max(120).optional(),
  issuedToPhone: indianPhone.optional().or(z.literal("")),
  issuedToEmployeeId: optionalUuid,
});

export type VoucherActionInput = z.infer<typeof voucherActionSchema>;

/** Cashier redemption at the admin order desk (prepaid cards only). */
export const redeemVoucherSchema = z.object({
  code: z.string().trim().min(4, "Enter the gift card code").max(30),
});

export type RedeemVoucherInput = z.infer<typeof redeemVoucherSchema>;

export const pricingUpdateSchema = z
  .object({
    pricePaise: z.number().int().min(0).max(100_000_00).optional(),
    expressMultiplier: z.number().min(1).max(5).optional(),
    active: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.pricePaise !== undefined ||
      v.expressMultiplier !== undefined ||
      v.active !== undefined,
    { message: "Nothing to update." },
  );

export type PricingUpdateInput = z.infer<typeof pricingUpdateSchema>;

/**
 * Settings editor: a map of EXISTING settings keys to new text values
 * (null clears a value). The route rejects keys that do not already
 * exist in the settings table, so the editor can never invent keys.
 */
export const settingsUpdateSchema = z.object({
  values: z
    .record(z.string().min(1).max(80), z.string().max(500).nullable())
    .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update." }),
});

export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;

/* ------------------------------------------------------------------ */
/* Phase 8 — QR/OTP handovers. The chain itself lives in               */
/* src/lib/handovers.ts; these schemas only shape the request bodies.  */
/* All chain rules (sequence, role, OTP/QR match, status effect) are   */
/* enforced server-side by checkHandover — the schema stays dumb.      */
/* ------------------------------------------------------------------ */

export const handoverCompleteSchema = z.object({
  pointId: z.string().trim().min(1, "Choose the handover point").max(60),
  toEmployeeId: z.string().uuid("Select the receiving employee"),
  method: z.enum(["qr", "otp"]),
  /** Customer OTP (OTP points only) — exactly 6 digits. */
  otp: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the customer's 6-digit OTP")
    .optional()
    .or(z.literal("")),
  /** Scanned QR payload or pasted token (QR points only). */
  qrToken: z.string().trim().max(200).optional().or(z.literal("")),
  /** Physical count handed over; defaults to the order's item count. */
  quantity: z.number().int().min(0).max(100_000).optional(),
  /** Delivery point only: record the Pay-on-Delivery collection too. */
  codCollected: z.boolean().optional(),
  /** Staff report: something from the bag is missing (flag, not a block). */
  missingItem: z.boolean().optional(),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});

export type HandoverCompleteInput = z.infer<typeof handoverCompleteSchema>;

export const regenerateOtpSchema = z.object({
  which: z.enum(["pickup", "delivery"]),
});

export type RegenerateOtpInput = z.infer<typeof regenerateOtpSchema>;

/* ------------------------------------------------------------------ */
/* Phase 9 — finance: record payments, refunds workflow, expenses,     */
/* daily cash closing. Money crosses the API in integer paise. The     */
/* method/category lists mirror the CHECK constraints in               */
/* supabase/schema_v5.sql and the constants in src/lib/finance.ts.     */
/* ------------------------------------------------------------------ */

export const recordPaymentSchema = z.object({
  method: z.enum(["cash", "upi", "card_machine", "bank_transfer"]),
  amountPaise: z.number().int().positive("Enter an amount above zero").max(100_000_00),
  reference: z.string().trim().max(120).optional().or(z.literal("")),
  note: z.string().trim().max(500).optional().or(z.literal("")),
  recordedByEmployeeId: optionalUuid,
});

export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

export const refundRequestSchema = z.object({
  amountPaise: z.number().int().positive("Enter an amount above zero").max(100_000_00),
  reason: z.string().trim().min(3, "Give a short reason for the refund").max(500),
  method: z.enum(["cash", "upi", "original_payment"]),
});

export type RefundRequestInput = z.infer<typeof refundRequestSchema>;

export const refundActionSchema = z.object({
  action: z.enum(["approve", "reject", "process"]),
});

export type RefundActionInput = z.infer<typeof refundActionSchema>;

export const expenseCreateSchema = z.object({
  expenseDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date (YYYY-MM-DD)"),
  category: z.enum([
    "detergent",
    "utilities",
    "rent",
    "fuel",
    "packaging",
    "maintenance",
    "salary",
    "other",
  ]),
  description: z.string().trim().max(300).optional().or(z.literal("")),
  amountPaise: z.number().int().positive("Enter an amount above zero").max(100_000_00),
  branchId: optionalUuid,
});

export type ExpenseCreateInput = z.infer<typeof expenseCreateSchema>;

export const closeDaySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date (YYYY-MM-DD)"),
  countedCashPaise: z.number().int().nonnegative("Counted cash cannot be negative").max(100_000_00),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});

export type CloseDayInput = z.infer<typeof closeDaySchema>;

/* Delta 1 — tiered roles + customer management. */

export const roleChangeSchema = z.object({
  role: z.enum(["customer", "ops_manager", "admin", "super_admin"]),
});

export type RoleChangeInput = z.infer<typeof roleChangeSchema>;

export const customerDisabledSchema = z.object({
  disabled: z.boolean(),
});

export type CustomerDisabledInput = z.infer<typeof customerDisabledSchema>;

/* Delta 2 — push token registration. The token's Expo shape is
   verified again in the route with isExpoPushToken (lib/push.ts);
   the schema only bounds type/length and the platform enum. */

export const pushRegisterSchema = z.object({
  token: z.string().trim().min(1).max(200),
  platform: z.enum(["android", "ios", "web"]),
});

export type PushRegisterInput = z.infer<typeof pushRegisterSchema>;

export const pushUnregisterSchema = z.object({
  token: z.string().trim().min(1).max(200),
});

export type PushUnregisterInput = z.infer<typeof pushUnregisterSchema>;

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ContactInput = z.infer<typeof contactSchema>;
