import { env } from "@pi-dash/env/server";
import { defineEventHandler } from "nitro/h3";

const isProduction = env.NODE_ENV === "production";

function getParentDomain(): string {
  const { hostname } = new URL(env.CORS_ORIGIN);
  const parts = hostname.split(".");
  // If hostname has 3+ parts (e.g. app.example.com), strip first subdomain
  // Otherwise use as-is (e.g. example.com)
  return parts.length > 2 ? parts.slice(1).join(".") : hostname;
}

function buildCsp(): string {
  const parentDomain = getParentDomain();
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://static.cloudflareinsights.com https://challenges.cloudflare.com https://*.${parentDomain}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    `img-src 'self' blob: data: https://api.dicebear.com https://*.gravatar.com https://*.r2.cloudflarestorage.com https://cdn.proudindian.ngo`,
    `media-src 'self' https://cdn.proudindian.ngo https://*.r2.cloudflarestorage.com`,
    "font-src 'self' https://fonts.gstatic.com",
    `connect-src 'self' https://*.${parentDomain} wss://*.${parentDomain} https://*.r2.cloudflarestorage.com`,
    "frame-src 'self' https://challenges.cloudflare.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

export default defineEventHandler((event) => {
  const headers: Record<string, string> = {
    "Permissions-Policy": "camera=(self), microphone=(), geolocation=()",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "0",
    ...(isProduction
      ? {
          "Content-Security-Policy": buildCsp(),
          "Strict-Transport-Security":
            "max-age=63072000; includeSubDomains; preload",
        }
      : {}),
  };
  for (const [name, value] of Object.entries(headers)) {
    event.res.headers.set(name, value);
  }
});
