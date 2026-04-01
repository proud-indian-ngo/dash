import { db } from "@pi-dash/db";
import { appConfig } from "@pi-dash/db/schema/app-config";
import { eq } from "drizzle-orm";
import { createRequestLogger } from "evlog";

const TTL_MS = 30_000;
let cached: { fetchedAt: number; value: boolean } | null = null;

export async function isNotificationsDisabled(): Promise<boolean> {
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return cached.value;
  }
  try {
    const rows = await db
      .select({ value: appConfig.value })
      .from(appConfig)
      .where(eq(appConfig.key, "notifications_disabled"))
      .limit(1);
    const disabled = rows[0]?.value === "true";
    cached = { fetchedAt: Date.now(), value: disabled };
    return disabled;
  } catch (error) {
    const log = createRequestLogger();
    log.set({ handler: "isNotificationsDisabled", event: "db_query_failed" });
    log.error(error instanceof Error ? error : String(error));
    log.emit();
    return false;
  }
}
