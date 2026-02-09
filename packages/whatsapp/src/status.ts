import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import { eq } from "drizzle-orm";
import { getWhatsAppApiUrl, getWhatsAppHeaders } from "./client";
import { formatPhoneForWhatsApp } from "./phone";

export async function checkIsOnWhatsApp(phone: string): Promise<boolean> {
  const apiUrl = getWhatsAppApiUrl();
  if (!apiUrl) {
    return false;
  }

  const formatted = formatPhoneForWhatsApp(phone);

  const url = new URL(`${apiUrl}/user/check`);
  url.searchParams.set("phone", formatted);

  const response = await fetch(url, {
    headers: getWhatsAppHeaders(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`WhatsApp check API error ${response.status}: ${text}`);
  }

  const data = (await response.json()) as {
    results?: { is_on_whatsapp?: boolean };
  };
  return data.results?.is_on_whatsapp ?? false;
}

export async function syncWhatsAppStatus(
  userId: string,
  phone: string | undefined
): Promise<void> {
  try {
    let isOnWhatsapp = false;
    if (phone && getWhatsAppApiUrl()) {
      isOnWhatsapp = await checkIsOnWhatsApp(phone);
    }
    await db.update(user).set({ isOnWhatsapp }).where(eq(user.id, userId));
  } catch (error) {
    console.error("Failed to sync WhatsApp status:", error);
  }
}
