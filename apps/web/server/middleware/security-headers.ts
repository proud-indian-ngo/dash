import { env } from "@pi-dash/env/server";
import { defineEventHandler, setHeaders } from "nitro/h3";

const isProduction = env.NODE_ENV === "production";

function getParentDomain(): string {
  const { hostname } = new URL(env.CORS_ORIGIN);
  const parts = hostname.split(".");
  // If hostname has 3+ parts (e.g. app.example.com), strip first subdomain
  // Otherwise use as-is (e.g. example.com)
  return parts.length > 2 ? parts.slice(1).join(".") : hostname;
}

function r2ConnectOrigin(): string {
  if (!env.R2_ENDPOINT) {
    return "";
  }
  return ` ${new URL(env.R2_ENDPOINT).origin}`;
}

function buildCsp(): string {
  const parentDomain = getParentDomain();
  const r2Origin = r2ConnectOrigin();
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com https://*.${parentDomain}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    `img-src 'self' data: https://api.dicebear.com https://*.gravatar.com https://*.r2.cloudflarestorage.com https://cdn.proudindian.ngo${r2Origin}`,
    `media-src 'self' https://cdn.proudindian.ngo https://*.r2.cloudflarestorage.com${r2Origin}`,
    "font-src 'self' https://fonts.gstatic.com",
    `connect-src 'self' https://*.${parentDomain} wss://*.${parentDomain} https://*.r2.cloudflarestorage.com${r2Origin}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

export default defineEventHandler((event) => {
  setHeaders(event, {
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
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
  });
});
