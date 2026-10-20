import {
  decideResolution,
  getResolution,
  overdueResolutionIds,
  resolutionRecipients,
} from "@pi-dash/db/queries/resolutions";
import { getUserIdsWithPermission } from "@pi-dash/notifications/helpers";
import {
  notifyResolutionDecided,
  notifyResolutionIssued,
} from "@pi-dash/notifications/send/governance";
import { todayInKolkata } from "@pi-dash/shared/income";
import { createRequestLogger } from "evlog";
import type { Job } from "pg-boss";

import type { NotifyResolutionPayload } from "../enqueue";
import { createNotifyHandler } from "./create-handler";

/** Every trustee the circular went to, with an account. */
async function trusteeUserIds(resolutionId: string): Promise<string[]> {
  const recipients = await resolutionRecipients(resolutionId);
  return [
    ...new Set(
      recipients.map((r) => r.userId).filter((id): id is string => !!id)
    ),
  ];
}

async function sendIssued({ resolutionId }: NotifyResolutionPayload) {
  const row = await getResolution(resolutionId);
  if (!(row && row.status === "issued")) {
    return { skipped: "not_issued" };
  }
  const userIds = await trusteeUserIds(resolutionId);
  await notifyResolutionIssued({
    resolutionId,
    responseDueOn: row.responseDueOn,
    title: row.title,
    userIds,
  });
  return { recipients: userIds.length };
}

async function sendDecided({ resolutionId }: NotifyResolutionPayload) {
  const row = await getResolution(resolutionId);
  if (
    !(
      row &&
      (row.status === "passed" ||
        row.status === "failed" ||
        row.status === "withdrawn")
    )
  ) {
    return { skipped: "not_decided" };
  }
  const managers = await getUserIdsWithPermission("governance.manage");
  const userIds = [
    ...new Set([...(await trusteeUserIds(resolutionId)), ...managers]),
  ];
  await notifyResolutionDecided({
    number: row.number,
    outcome: row.status,
    outcomeNote: row.outcomeNote,
    resolutionId,
    title: row.title,
    userIds,
  });
  return { recipients: userIds.length };
}

export const handleNotifyResolutionIssued = createNotifyHandler<
  NotifyResolutionPayload,
  unknown
>("notify-resolution-issued", async () => sendIssued);

export const handleNotifyResolutionDecided = createNotifyHandler<
  NotifyResolutionPayload,
  unknown
>("notify-resolution-decided", async () => sendDecided);

/**
 * Daily: an issued circular whose response date has passed fails (or
 * passes, if the last signature arrived on the day), and everyone hears.
 * Logs counts only.
 */
export async function handleCloseDueResolutions(
  _jobs: Job[],
  today: string = todayInKolkata()
): Promise<{ closed: number }> {
  const log = createRequestLogger({
    method: "JOB",
    path: "close-due-resolutions",
  });
  const ids = await overdueResolutionIds(today);
  let closed = 0;
  for (const id of ids) {
    const decision = await decideResolution(id, today);
    if (decision.status !== "issued") {
      closed += 1;
      await sendDecided({ resolutionId: id });
    }
  }
  log.set({ closed, due: ids.length, event: "resolutions_closed" });
  log.emit();
  return { closed };
}
