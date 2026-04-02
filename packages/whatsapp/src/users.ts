import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import { eq, inArray } from "drizzle-orm";

export async function getUserPhone(userId: string): Promise<string | null> {
  const rows = await db
    .select({ phone: user.phone })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return rows[0]?.phone ?? null;
}

export async function getUserPhones(
  userIds: string[]
): Promise<Map<string, string>> {
  if (userIds.length === 0) {
    return new Map();
  }
  const rows = await db
    .select({ id: user.id, phone: user.phone })
    .from(user)
    .where(inArray(user.id, userIds));
  const map = new Map<string, string>();
  for (const row of rows) {
    if (row.phone) {
      map.set(row.id, row.phone);
    }
  }
  return map;
}
