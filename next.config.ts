import type { NextConfig } from "next";

// Next injects inline bootstrap/hydration scripts and Tailwind inlines styles,
// so 'unsafe-inline' is required without a per-request nonce (heavier setup).
// Dev/Turbopack additionally needs 'unsafe-eval'. All network calls to external
// services (Telegram, Resend) happen server-side, so connect-src stays 'self'.
const isDev = process.env.NODE_ENV !== "production";
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  // Honored only over HTTPS (ignored on plain HTTP); safe to always send.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  // native addon — don't bundle it, load from node_modules at runtime
  serverExternalPackages: ["better-sqlite3"],
  // drop the X-Powered-By: Next.js fingerprint
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
