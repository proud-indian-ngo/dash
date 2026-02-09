import { env } from "@pi-dash/env/server";

export function getWhatsAppApiUrl(): string | undefined {
  return env.WHATSAPP_API_URL;
}

export function getWhatsAppHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (env.WHATSAPP_AUTH_USER && env.WHATSAPP_AUTH_PASS) {
    const credentials = btoa(
      `${env.WHATSAPP_AUTH_USER}:${env.WHATSAPP_AUTH_PASS}`
    );
    headers.Authorization = `Basic ${credentials}`;
  }
  return headers;
}
