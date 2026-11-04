import Constants from "expo-constants";

/**
 * App configuration (Mobile Phase 1).
 *
 * Values come from app.json `extra`, overridable per build with
 * EXPO_PUBLIC_* env vars. The Supabase key is the project's
 * PUBLISHABLE (anon) key — public by design, exactly like the web
 * app's NEXT_PUBLIC_ key; all data access is governed by RLS.
 * The service-role key must NEVER ship in the app.
 */
const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;

export const API_BASE_URL: string =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? extra.apiBaseUrl ?? "https://z-clean-iota.vercel.app";

export const SUPABASE_URL: string =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? extra.supabaseUrl ?? "";

export const SUPABASE_PUBLISHABLE_KEY: string =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? extra.supabasePublishableKey ?? "";

export const WEB_ADMIN_URL = `${API_BASE_URL}/admin`;

/**
 * Admin console palette — mirrors the web admin redesign (dark slate
 * sidebar/header, signature green accent, light panel background,
 * white cards with a pale border). Used by the admin dashboard home
 * and the admin stack screens.
 */
export const adminTheme = {
  slate: "#2A3F54",
  slateDeep: "#22354A",
  accent: "#1ABB9C",
  panelBg: "#F7F7F7",
  cardBorder: "#E6E9ED",
  muted: "#73879C",
  heading: "#172D44",
};

/** Brand palette — mirrors the web app's Tailwind brand scale. */
export const brand = {
  teal: "#22786d", // brand-600 (primary)
  tealDark: "#1e6159", // brand-700
  tealDarker: "#18423e", // brand-900
  tealSoft: "#effaf8", // brand-50
  tealBorder: "#d7f2ec", // brand-100
  ink: "#1f2937",
  inkSoft: "#6b7280",
  danger: "#b91c1c",
  dangerSoft: "#fef2f2",
  amber: "#92400e",
  amberSoft: "#fffbeb",
  green: "#15803d",
  greenSoft: "#f0fdf4",
  white: "#ffffff",
  pageBg: "#f7faf9",
};
