import { sendMessage } from "../send-message";
import { getTopicChannels, TOPICS } from "../topics";

export type KalakritiRegistrationTransition =
  | "registration_open"
  | "registration_close_reminder"
  | "registration_closed";

export interface KalakritiRegistrationLifecycleOptions {
  editionId: string;
  editionName: string;
  recipientUserId: string;
  transition: KalakritiRegistrationTransition;
  transitionRevision: string;
  year: number;
}

export async function notifyKalakritiRegistrationLifecycle({
  editionId,
  editionName,
  recipientUserId,
  transition,
  transitionRevision,
  year,
}: KalakritiRegistrationLifecycleOptions): Promise<void> {
  const copy = registrationCopy(editionName, transition);
  await sendMessage({
    body: copy.body,
    channels: getTopicChannels(TOPICS.KALAKRITI_REGISTRATION),
    clickAction: `/kalakriti/${year}`,
    idempotencyKey: `kalakriti-registration-${editionId}-${transition}-${transitionRevision}-${recipientUserId}`,
    title: copy.title,
    to: recipientUserId,
    topic: TOPICS.KALAKRITI_REGISTRATION,
  });
}

export interface KalakritiScheduleChangedOptions {
  editionId: string;
  editionName: string;
  recipientUserId: string;
  scheduleRevision: string | number;
  year: number;
}

export async function notifyKalakritiScheduleChanged({
  editionId,
  editionName,
  recipientUserId,
  scheduleRevision,
  year,
}: KalakritiScheduleChangedOptions): Promise<void> {
  await sendMessage({
    body: `The schedule for ${editionName} has changed.`,
    channels: getTopicChannels(TOPICS.KALAKRITI_SCHEDULE),
    clickAction: `/kalakriti/${year}/schedule`,
    idempotencyKey: `kalakriti-schedule-${editionId}-${scheduleRevision}-${recipientUserId}`,
    title: "Kalakriti schedule updated",
    to: recipientUserId,
    topic: TOPICS.KALAKRITI_SCHEDULE,
  });
}

export interface KalakritiGuardianReactivatedOptions {
  editionId: string;
  editionName: string;
  membershipId: string;
  recipientUserId: string;
  year: number;
}

export async function notifyKalakritiGuardianReactivated({
  editionId,
  editionName,
  membershipId,
  recipientUserId,
  year,
}: KalakritiGuardianReactivatedOptions): Promise<void> {
  await sendMessage({
    body: `Your Guardian access for ${editionName} is active again.`,
    channels: getTopicChannels(TOPICS.KALAKRITI_REGISTRATION),
    clickAction: `/kalakriti/${year}`,
    idempotencyKey: `kalakriti-guardian-reactivated-${editionId}-${membershipId}-${recipientUserId}`,
    title: "Kalakriti Guardian access restored",
    to: recipientUserId,
    topic: TOPICS.KALAKRITI_REGISTRATION,
  });
}

function registrationCopy(
  editionName: string,
  transition: KalakritiRegistrationTransition
): { body: string; title: string } {
  switch (transition) {
    case "registration_open":
      return {
        body: `Registration is now open for ${editionName}.`,
        title: "Kalakriti registration open",
      };
    case "registration_close_reminder":
      return {
        body: `Registration for ${editionName} closes soon.`,
        title: "Kalakriti registration closing soon",
      };
    case "registration_closed":
      return {
        body: `Registration for ${editionName} is now closed.`,
        title: "Kalakriti registration closed",
      };
    default:
      throw new Error(
        `Unsupported Kalakriti registration transition: ${transition}`
      );
  }
}
