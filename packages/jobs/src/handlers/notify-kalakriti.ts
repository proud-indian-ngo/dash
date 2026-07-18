import {
  notifyKalakritiGuardianReactivated,
  notifyKalakritiRegistrationLifecycle,
  notifyKalakritiScheduleChanged,
} from "@pi-dash/notifications/send/kalakriti";
import type {
  NotifyKalakritiGuardianReactivatedPayload,
  NotifyKalakritiRegistrationPayload,
  NotifyKalakritiScheduleChangedPayload,
  RemindKalakritiRegistrationClosePayload,
} from "../enqueue";
import {
  getKalakritiNotificationEdition,
  resolveKalakritiGuardianRecipients,
  resolveKalakritiScheduleRecipients,
} from "../lib/kalakriti-notification-recipients";
import { createNotifyHandler } from "./create-handler";

type RegistrationTransition =
  | "registration_close_reminder"
  | "registration_closed"
  | "registration_open";

interface KalakritiNotificationResult {
  recipientCount: number;
  skipped?: string;
}

async function sendRegistrationLifecycle(
  data: NotifyKalakritiRegistrationPayload,
  transition: Exclude<RegistrationTransition, "registration_close_reminder">
): Promise<KalakritiNotificationResult> {
  const edition = await getKalakritiNotificationEdition(data.editionId);
  if (!edition) {
    return { recipientCount: 0, skipped: "edition_missing" };
  }
  const recipientIds = await resolveKalakritiGuardianRecipients(data.editionId);
  await Promise.all(
    recipientIds.map(async (recipientUserId) =>
      notifyKalakritiRegistrationLifecycle({
        editionId: edition.id,
        editionName: edition.name,
        recipientUserId,
        transition,
        transitionRevision: data.transitionId,
        year: edition.year,
      })
    )
  );
  return { recipientCount: recipientIds.length };
}

export const handleNotifyKalakritiRegistrationOpen = createNotifyHandler<
  NotifyKalakritiRegistrationPayload,
  KalakritiNotificationResult
>(
  "notify-kalakriti-registration-open",
  async () => (data) => sendRegistrationLifecycle(data, "registration_open")
);

export const handleNotifyKalakritiRegistrationClosed = createNotifyHandler<
  NotifyKalakritiRegistrationPayload,
  KalakritiNotificationResult
>(
  "notify-kalakriti-registration-closed",
  async () => (data) => sendRegistrationLifecycle(data, "registration_closed")
);

async function remindRegistrationClose(
  data: RemindKalakritiRegistrationClosePayload
): Promise<KalakritiNotificationResult> {
  const edition = await getKalakritiNotificationEdition(data.editionId);
  if (!edition) {
    return { recipientCount: 0, skipped: "edition_missing" };
  }
  if (
    edition.lifecycle !== "registration_open" ||
    edition.plannedRegistrationCloseAt.getTime() !==
      data.plannedRegistrationCloseAt
  ) {
    return { recipientCount: 0, skipped: "reminder_stale" };
  }
  const recipientIds = await resolveKalakritiGuardianRecipients(data.editionId);
  await Promise.all(
    recipientIds.map(async (recipientUserId) =>
      notifyKalakritiRegistrationLifecycle({
        editionId: edition.id,
        editionName: edition.name,
        recipientUserId,
        transition: "registration_close_reminder",
        transitionRevision: String(data.plannedRegistrationCloseAt),
        year: edition.year,
      })
    )
  );
  return { recipientCount: recipientIds.length };
}

export const handleRemindKalakritiRegistrationClose = createNotifyHandler<
  RemindKalakritiRegistrationClosePayload,
  KalakritiNotificationResult
>("remind-kalakriti-registration-close", async () => remindRegistrationClose);

async function notifyScheduleChanged(
  data: NotifyKalakritiScheduleChangedPayload
): Promise<KalakritiNotificationResult> {
  const edition = await getKalakritiNotificationEdition(data.editionId);
  if (!edition || edition.lifecycle === "draft") {
    return {
      recipientCount: 0,
      skipped: edition ? "schedule_not_public" : "edition_missing",
    };
  }
  const recipientIds = await resolveKalakritiScheduleRecipients(data);
  await Promise.all(
    recipientIds.map(async (recipientUserId) =>
      notifyKalakritiScheduleChanged({
        editionId: edition.id,
        editionName: edition.name,
        recipientUserId,
        scheduleRevision: data.revision,
        year: edition.year,
      })
    )
  );
  return { recipientCount: recipientIds.length };
}

export const handleNotifyKalakritiScheduleChanged = createNotifyHandler<
  NotifyKalakritiScheduleChangedPayload,
  KalakritiNotificationResult
>("notify-kalakriti-schedule-changed", async () => notifyScheduleChanged);

async function notifyGuardianReactivated(
  data: NotifyKalakritiGuardianReactivatedPayload
): Promise<KalakritiNotificationResult> {
  const edition = await getKalakritiNotificationEdition(data.editionId);
  if (!edition) {
    return { recipientCount: 0, skipped: "edition_missing" };
  }
  await notifyKalakritiGuardianReactivated({
    editionId: edition.id,
    editionName: edition.name,
    membershipId: data.membershipId,
    recipientUserId: data.userId,
    year: edition.year,
  });
  return { recipientCount: 1 };
}

export const handleNotifyKalakritiGuardianReactivated = createNotifyHandler<
  NotifyKalakritiGuardianReactivatedPayload,
  KalakritiNotificationResult
>(
  "notify-kalakriti-guardian-reactivated",
  async () => notifyGuardianReactivated
);
