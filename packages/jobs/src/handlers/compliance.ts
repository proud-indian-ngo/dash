import {
  generateComplianceItems,
  openItemsDueSoon,
} from "@pi-dash/db/queries/compliance";
import { getUserIdsWithPermission } from "@pi-dash/notifications/helpers";
import { notifyComplianceDue } from "@pi-dash/notifications/send/governance";
import { itemsDueForReminder } from "@pi-dash/shared/compliance";
import { todayInKolkata } from "@pi-dash/shared/income";
import { createRequestLogger } from "evlog";
import type { Job } from "pg-boss";

/** Daily: create the calendar's items for the next 400 days. Counts only. */
export async function handleGenerateComplianceItems(
  _jobs: Job[],
  today: string = todayInKolkata()
): Promise<{ created: number }> {
  const log = createRequestLogger({
    method: "JOB",
    path: "generate-compliance-items",
  });
  const created = await generateComplianceItems(today);
  log.set({ created, event: "compliance_items_generated" });
  log.emit();
  return { created };
}

/**
 * Daily: an open item due in 30, 7 or 1 days reminds its owner, or
 * everyone with governance.manage when it has none.
 */
export async function handleRemindComplianceItems(
  _jobs: Job[],
  today: string = todayInKolkata()
): Promise<{ failures: number; notified: number }> {
  const log = createRequestLogger({
    method: "JOB",
    path: "remind-compliance-items",
  });
  const due = itemsDueForReminder(await openItemsDueSoon(today), today);
  if (due.length === 0) {
    log.set({ event: "no_compliance_reminders" });
    log.emit();
    return { failures: 0, notified: 0 };
  }
  const managers = await getUserIdsWithPermission("governance.manage");
  const sends = due.flatMap(({ daysLeft, item }) =>
    (item.ownerUserId ? [item.ownerUserId] : managers).map((userId) =>
      notifyComplianceDue({
        daysLeft,
        dueOn: item.dueOn,
        itemId: item.id,
        title: item.title,
        userId,
      })
    )
  );
  const results = await Promise.allSettled(sends);
  const failures = results.filter((r) => r.status === "rejected").length;
  log.set({ event: "compliance_reminded", failures, notified: sends.length });
  log.emit();
  if (failures > 0) {
    throw new Error(
      `${failures}/${sends.length} compliance reminder(s) failed`
    );
  }
  return { failures, notified: sends.length };
}
