import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import { eq } from "drizzle-orm";

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
