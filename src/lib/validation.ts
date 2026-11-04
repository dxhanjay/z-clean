import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
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

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ContactInput = z.infer<typeof contactSchema>;
