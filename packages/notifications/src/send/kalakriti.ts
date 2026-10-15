import type { DigestRow } from "@pi-dash/shared/notification-digest";
import { whatsappTemplate } from "@pi-dash/whatsapp/template-message";

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
    digest: { meta: "Registration", name: editionName, status: copy.status },
    idempotencyKey: `kalakriti-registration-${editionId}-${transition}-${transitionRevision}-${recipientUserId}`,
    title: copy.title,
    to: recipientUserId,
    topic: TOPICS.KALAKRITI_REGISTRATION,
    whatsappTemplate: whatsappTemplate(
      "kalakriti_registration",
      { edition: editionName, status: copy.templateStatus },
      `/kalakriti/${year}`
    ),
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
    whatsappTemplate: whatsappTemplate(
      "kalakriti_schedule_changed",
      { edition: editionName },
      `/kalakriti/${year}/schedule`
    ),
  });
}

export interface KalakritiTransportChangedOptions {
  assignmentId: string;
  centerId: string;
  changeId: string;
  editionId: string;
  editionName: string;
  recipientUserId: string;
  year: number;
}

export async function notifyKalakritiTransportChanged({
  assignmentId,
  centerId,
  changeId,
  editionId,
  editionName,
  recipientUserId,
  year,
}: KalakritiTransportChangedOptions): Promise<void> {
  await sendMessage({
    body: `Transport details changed for ${editionName}.`,
    channels: getTopicChannels(TOPICS.KALAKRITI_TRANSPORT),
    clickAction: `/kalakriti/${year}/centers?centerId=${encodeURIComponent(centerId)}`,
    idempotencyKey: `kalakriti-transport-${editionId}-${assignmentId}-${changeId}-${recipientUserId}`,
    title: "Kalakriti transport updated",
    to: recipientUserId,
    topic: TOPICS.KALAKRITI_TRANSPORT,
    whatsappTemplate: whatsappTemplate(
      "kalakriti_transport_changed",
      { edition: editionName },
      `/kalakriti/${year}/centers?centerId=${encodeURIComponent(centerId)}`
    ),
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
    digest: {
      meta: "Your Guardian access is active again",
      name: editionName,
      status: { label: "Restored", tone: "success" },
    },
    idempotencyKey: `kalakriti-guardian-reactivated-${editionId}-${membershipId}-${recipientUserId}`,
    title: "Kalakriti Guardian access restored",
    to: recipientUserId,
    topic: TOPICS.KALAKRITI_REGISTRATION,
    whatsappTemplate: whatsappTemplate(
      "kalakriti_guardian_reactivated",
      { edition: editionName },
      `/kalakriti/${year}`
    ),
  });
}

function registrationCopy(
  editionName: string,
  transition: KalakritiRegistrationTransition
): {
  body: string;
  status: DigestRow["status"];
  /** Fills "Registration for {{edition}} is {{status}}." */
  templateStatus: string;
  title: string;
} {
  switch (transition) {
    case "registration_open":
      return {
        body: `Registration is now open for ${editionName}.`,
        status: { label: "Open", tone: "success" },
        templateStatus: "now open",
        title: "Kalakriti registration open",
      };
    case "registration_close_reminder":
      return {
        body: `Registration for ${editionName} closes soon.`,
        status: { label: "Closing soon", tone: "warning" },
        templateStatus: "closing soon",
        title: "Kalakriti registration closing soon",
      };
    case "registration_closed":
      return {
        body: `Registration for ${editionName} is now closed.`,
        status: { label: "Closed", tone: "neutral" },
        templateStatus: "now closed",
        title: "Kalakriti registration closed",
      };
    default:
      throw new Error(
        `Unsupported Kalakriti registration transition: ${transition}`
      );
  }
}
