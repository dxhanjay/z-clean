import type { NextConfig } from "next";

/**
 * Security headers (P0 hardening) — applied to every response.
 *
 * CSP notes:
 *  - script-src keeps 'unsafe-inline' because Next.js injects inline
 *    bootstrap scripts and this app does not use CSP nonces; removing
 *    it would break the app. The policy still locks scripts to
 *    same-origin (no third-party script hosts at all).
 *  - img-src additionally allows the Laundra template CDN, where the
 *    Phase 6 imagery is hotlinked from (src/lib/media.ts), plus
 *    data:/blob: for generated QR codes and previews.
 *  - connect-src allows Supabase (REST + realtime websockets).
 *  - HSTS is deliberately NOT set here: Vercel already sends
 *    Strict-Transport-Security on every response; a second header
 *    would duplicate it.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  "img-src 'self' data: blob: https://cdn.prod.website-files.com",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "font-src 'self' data:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self)",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
