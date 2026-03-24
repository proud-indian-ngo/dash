import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import { and, eq, inArray, isNotNull } from "drizzle-orm";

export async function getWhatsAppNotifications(
  userId: string
): Promise<boolean> {
  const rows = await db
    .select({ whatsappNotifications: user.whatsappNotifications })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return rows[0]?.whatsappNotifications ?? true;
}

export async function setWhatsAppNotifications(
  userId: string,
  enabled: boolean
): Promise<void> {
  await db
    .update(user)
    .set({ whatsappNotifications: enabled })
    .where(eq(user.id, userId));
}

export async function getUserPhoneIfEnabled(
  userId: string
): Promise<string | null> {
  const rows = await db
    .select({ phone: user.phone })
    .from(user)
    .where(
      and(
        eq(user.id, userId),
        eq(user.whatsappNotifications, true),
        isNotNull(user.phone)
      )
    )
    .limit(1);
  return rows[0]?.phone ?? null;
}

export async function getEnabledUserPhones(
  userIds: string[]
): Promise<Map<string, string>> {
  if (userIds.length === 0) {
    return new Map();
  }
  const rows = await db
    .select({ id: user.id, phone: user.phone })
    .from(user)
    .where(
      and(
        inArray(user.id, userIds),
        eq(user.whatsappNotifications, true),
        isNotNull(user.phone)
      )
    );
  const map = new Map<string, string>();
  for (const row of rows) {
    if (row.phone) {
      map.set(row.id, row.phone);
    }
  }
  return map;
}
