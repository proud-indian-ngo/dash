import {
  minTrusteesOn,
  openTrusteeTerms,
} from "@pi-dash/db/queries/governance";
import { getUserIdsWithPermission } from "@pi-dash/notifications/helpers";
import { notifyTermEnding } from "@pi-dash/notifications/send/governance";
import {
  boardOn,
  lastDayOf,
  nextDay,
  termsDueForReminder,
} from "@pi-dash/shared/governance";
import { todayInKolkata } from "@pi-dash/shared/income";
import { createRequestLogger } from "evlog";
import type { Job } from "pg-boss";

export interface RemindTrusteeTermsResult {
  failures: number;
  notified: number;
  terms: number;
}

/**
 * Daily: a trustee's fixed term ending in 90, 30 or 7 days notifies the
 * trustee (when linked to an account) and everyone with governance.manage,
 * and says so when the board would fall below the deed's minimum. Each
 * message is idempotent per term, offset and recipient. Logs counts only.
 */
export async function handleRemindTrusteeTerms(
  _jobs: Job[],
  today: string = todayInKolkata()
): Promise<RemindTrusteeTermsResult> {
  const log = createRequestLogger({
    method: "JOB",
    path: "remind-trustee-terms",
  });
  const open = await openTrusteeTerms();
  const due = termsDueForReminder(open, today);
  if (due.length === 0) {
    log.set({ event: "no_terms_ending", openTerms: open.length });
    log.emit();
    return { failures: 0, notified: 0, terms: 0 };
  }
  const managers = await getUserIdsWithPermission("governance.manage");
  const minimum = await minTrusteesOn(today);
  const trustees = open.map((t) => ({
    id: t.trusteeId,
    isCoFounder: false,
    legalName: t.legalName,
  }));
  const sends: Promise<void>[] = [];
  for (const { daysLeft, term } of due) {
    const row = open.find((t) => t.id === term.id);
    const last = lastDayOf(term);
    if (!(row && last)) {
      continue;
    }
    const after = boardOn(
      { offices: [], terms: open, trustees },
      nextDay(last)
    ).length;
    const recipients = new Set(managers);
    if (row.userId) {
      recipients.add(row.userId);
    }
    for (const userId of recipients) {
      sends.push(
        notifyTermEnding({
          daysLeft,
          isOwnTerm: userId === row.userId,
          lastDay: last,
          leavesBoardShort: after < minimum,
          termId: term.id,
          trusteeName: row.legalName,
          userId,
        })
      );
    }
  }
  const results = await Promise.allSettled(sends);
  const failures = results.filter((r) => r.status === "rejected").length;
  log.set({
    event: "trustee_terms_reminded",
    failures,
    notified: sends.length,
    terms: due.length,
  });
  log.emit();
  if (failures > 0) {
    throw new Error(`${failures}/${sends.length} term reminder(s) failed`);
  }
  return { failures, notified: sends.length, terms: due.length };
}
