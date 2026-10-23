import { db } from "@pi-dash/db";
import { teamEvent } from "@pi-dash/db/schema/team-event";
import { inArray } from "drizzle-orm";

/**
 * Whether a cancel still stands when its job runs. A restore clears
 * `cancelledAt` and a later cancel replaces it (with its own jobs), so a job
 * for this cancel would announce one that no longer applies.
 */
export async function isCancelInEffect({
  cancelledAt,
  cancelledEventIds,
}: {
  cancelledAt: number;
  cancelledEventIds: string[];
}): Promise<boolean> {
  // A cut that only dropped unsaved sessions marks no row to restore.
  if (cancelledEventIds.length === 0) {
    return true;
  }
  const rows = await db.query.teamEvent.findMany({
    columns: { cancelledAt: true },
    where: inArray(teamEvent.id, cancelledEventIds),
  });
  return rows.some((row) => row.cancelledAt?.getTime() === cancelledAt);
}
