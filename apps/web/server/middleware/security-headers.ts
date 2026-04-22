import { env } from "@pi-dash/env/server";
import { defineEventHandler, setHeaders } from "nitro/h3";

const isProduction = env.NODE_ENV === "production";

function getParentDomain(): string {
  const hostname = new URL(env.CORS_ORIGIN).hostname;
  const parts = hostname.split(".");
  // If hostname has 3+ parts (e.g. app.example.com), strip first subdomain
  // Otherwise use as-is (e.g. example.com)
  return parts.length > 2 ? parts.slice(1).join(".") : hostname;
}

function buildCsp(): string {
  const parentDomain = getParentDomain();
  const posthogOrigin = new URL(env.POSTHOG_HOST).origin;
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com ${posthogOrigin}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    `img-src 'self' data: https://api.dicebear.com https://*.gravatar.com https://*.r2.cloudflarestorage.com https://cdn.proudindian.ngo`,
    `media-src 'self' https://cdn.proudindian.ngo https://*.r2.cloudflarestorage.com`,
    "font-src 'self' https://fonts.gstatic.com",
    `connect-src 'self' https://*.${parentDomain} wss://*.${parentDomain} https://*.r2.cloudflarestorage.com`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

export default defineEventHandler((event) => {
  setHeaders(event, {
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "X-XSS-Protection": "0",
    ...(isProduction
      ? {
          "Strict-Transport-Security":
            "max-age=63072000; includeSubDomains; preload",
          "Content-Security-Policy": buildCsp(),
        }
      : {}),
  });
});
