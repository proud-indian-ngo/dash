import { db } from "@pi-dash/db";
import { getMeeting } from "@pi-dash/db/queries/meetings";
import { trustee } from "@pi-dash/db/schema/governance";
import { meetingAttendance } from "@pi-dash/db/schema/meetings";
import { getUserIdsWithPermission } from "@pi-dash/notifications/helpers";
import { notifyMeetingNotice } from "@pi-dash/notifications/send/governance";
import { MEETING_MODE_LABELS } from "@pi-dash/shared/meetings";
import { eq } from "drizzle-orm";

import type { NotifyMeetingPayload } from "../enqueue";
import { createNotifyHandler } from "./create-handler";

const startsFmt = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

/** The notice goes to the trustees it was sent to and to governance managers. */
async function sendNotice({ meetingId }: NotifyMeetingPayload) {
  const row = await getMeeting(meetingId);
  if (!(row && row.status === "convened")) {
    return { skipped: "not_convened" };
  }
  const trustees = await db
    .select({ userId: trustee.userId })
    .from(meetingAttendance)
    .innerJoin(trustee, eq(trustee.id, meetingAttendance.trusteeId))
    .where(eq(meetingAttendance.meetingId, meetingId));
  const managers = await getUserIdsWithPermission("governance.manage");
  const userIds = [
    ...new Set([
      ...trustees.map((t) => t.userId).filter((id): id is string => !!id),
      ...managers,
    ]),
  ];
  await notifyMeetingNotice({
    meetingId,
    startsAt: startsFmt.format(row.startsAt),
    title: row.title,
    userIds,
    where: row.place || MEETING_MODE_LABELS[row.mode],
  });
  return { recipients: userIds.length };
}

export const handleNotifyMeetingNotice = createNotifyHandler<
  NotifyMeetingPayload,
  unknown
>("notify-meeting-notice", async () => sendNotice);
