import {
  circularRecipients,
  circularResolutions,
  decideCircular,
  getCircular,
  getResolution,
  overdueCircularIds,
  resolutionRecipients,
} from "@pi-dash/db/queries/resolutions";
import { getUserIdsWithPermission } from "@pi-dash/notifications/helpers";
import {
  notifyCircularIssued,
  notifyResolutionsDecided,
} from "@pi-dash/notifications/send/governance";
import { todayInKolkata } from "@pi-dash/shared/income";
import { createRequestLogger } from "evlog";
import type { Job } from "pg-boss";

import {
  enqueue,
  inTransaction,
  type NotifyCircularPayload,
  type NotifyResolutionPayload,
} from "../enqueue";
import { createNotifyHandler } from "./create-handler";

function accountIds(recipients: { userId: string | null }[]): string[] {
  return [
    ...new Set(
      recipients.map((r) => r.userId).filter((id): id is string => !!id)
    ),
  ];
}

/** Every trustee the resolution's circular went to, with an account. */
async function trusteeUserIds(resolutionId: string): Promise<string[]> {
  return accountIds(await resolutionRecipients(resolutionId));
}

async function sendIssued({ circularId }: NotifyCircularPayload) {
  const [row, resolutions] = await Promise.all([
    getCircular(circularId),
    circularResolutions(circularId),
  ]);
  const open = resolutions.filter((r) => r.status === "issued");
  if (!row || open.length === 0) {
    return { skipped: "not_open" };
  }
  const userIds = accountIds(await circularRecipients(circularId));
  await notifyCircularIssued({
    circularId,
    responseDueOn: row.responseDueOn,
    titles: resolutions.map((r) => r.title),
    userIds,
  });
  return { recipients: userIds.length };
}

async function sendDecided({ resolutionIds }: NotifyResolutionPayload) {
  const rows = (
    await Promise.all(resolutionIds.map((id) => getResolution(id)))
  ).filter(
    (row): row is NonNullable<typeof row> =>
      !!row &&
      (row.status === "passed" ||
        row.status === "failed" ||
        row.status === "withdrawn")
  );
  const [first] = rows;
  if (!first) {
    return { skipped: "not_decided" };
  }
  const managers = await getUserIdsWithPermission("governance.manage");
  const trustees = await Promise.all(rows.map((r) => trusteeUserIds(r.id)));
  const userIds = [...new Set([...trustees.flat(), ...managers])];
  await notifyResolutionsDecided({
    circularId: first.circularId,
    resolutions: rows
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((row) => ({
        number: row.number,
        outcome: row.status as "passed" | "failed" | "withdrawn",
        outcomeNote: row.outcomeNote,
        position: row.position,
        resolutionId: row.id,
        title: row.title,
      })),
    userIds,
  });
  return { recipients: userIds.length };
}

export const handleNotifyCircularIssued = createNotifyHandler<
  NotifyCircularPayload,
  unknown
>("notify-circular-issued", async () => sendIssued);

export const handleNotifyResolutionDecided = createNotifyHandler<
  NotifyResolutionPayload,
  unknown
>("notify-resolution-decided", async () => sendDecided);

/**
 * Daily: the open resolutions of a circular whose response date has passed
 * fail (or pass, if the last signature arrived on the day), in order, and
 * everyone hears once per circular through the notice job. Logs counts only.
 */
export async function handleCloseDueResolutions(
  _jobs: Job[],
  today: string = todayInKolkata()
): Promise<{ closed: number }> {
  const log = createRequestLogger({
    method: "JOB",
    path: "close-due-resolutions",
  });
  const ids = await overdueCircularIds(today);
  let closed = 0;
  for (const id of ids) {
    const decisions = await decideCircular(id, today, async (tx, all) => {
      const decided = all.filter((d) => d.status !== "issued");
      if (decided.length === 0) {
        return;
      }
      // Queued in the decision's transaction, not sent here: a retry of
      // this job no longer finds the circular, but pg-boss retries the
      // notice job.
      await enqueue(
        "notify-resolution-decided",
        { resolutionIds: decided.map((d) => d.resolutionId) },
        {
          db: inTransaction(tx),
          singletonKey: decided
            .map((d) => `${d.resolutionId}-${d.status}`)
            .join("_"),
        }
      );
    });
    closed += decisions.filter((d) => d.status !== "issued").length;
  }
  log.set({ closed, due: ids.length, event: "resolutions_closed" });
  log.emit();
  return { closed };
}
