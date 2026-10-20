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

import type {
  NotifyCircularPayload,
  NotifyResolutionPayload,
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
 * everyone hears once per circular. Logs counts only.
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
    const decided = (await decideCircular(id, today))
      .filter((d) => d.status !== "issued")
      .map((d) => d.resolutionId);
    closed += decided.length;
    if (decided.length > 0) {
      await sendDecided({ resolutionIds: decided });
    }
  }
  log.set({ closed, due: ids.length, event: "resolutions_closed" });
  log.emit();
  return { closed };
}
