import type { PgBoss, Queue, WorkOptions } from "pg-boss";
import { type JobName, QUEUE_NAMES } from "../enqueue";
import { handleCreateRecurringEvents } from "./create-recurring-events";
import {
  handleNotifyAdvancePaymentApproved,
  handleNotifyAdvancePaymentRejected,
  handleNotifyAdvancePaymentSubmitted,
} from "./notify-advance-payment";
import { handleNotifyEventFeedbackOpen } from "./notify-event-feedback";
import {
  handleNotifyEventInterestApproved,
  handleNotifyEventInterestReceived,
  handleNotifyEventInterestRejected,
} from "./notify-event-interest";
import {
  handleNotifyPhotoApproved,
  handleNotifyPhotoRejected,
} from "./notify-event-photo";
import { handleNotifyEventUpdatePosted } from "./notify-event-update";
import {
  handleNotifyReimbursementApproved,
  handleNotifyReimbursementRejected,
  handleNotifyReimbursementSubmitted,
} from "./notify-reimbursement";
import {
  handleNotifyAddedToTeam,
  handleNotifyRemovedFromTeam,
  handleNotifyTeamDeleted,
  handleNotifyTeamUpdated,
} from "./notify-team";
import {
  handleNotifyAddedToEvent,
  handleNotifyEventCancelled,
  handleNotifyEventCreated,
  handleNotifyEventUpdated,
  handleNotifyRemovedFromEvent,
  handleNotifyUsersAddedToEvent,
} from "./notify-team-event";
import {
  handleNotifyVendorPaymentApproved,
  handleNotifyVendorPaymentRejected,
  handleNotifyVendorPaymentSubmitted,
  handleNotifyVpInvoiceApproved,
  handleNotifyVpInvoiceRejected,
  handleNotifyVpInvoiceSubmitted,
} from "./notify-vendor-payment";
import {
  handleNotifyVptApproved,
  handleNotifyVptRejected,
  handleNotifyVptSubmitted,
} from "./notify-vendor-payment-transaction";
import { handleSendBulkNotification } from "./send-bulk-notification";
import { handleSendNotification } from "./send-notification";
import { handleSendScheduledMessage } from "./send-scheduled-message";
import { handleSendWhatsApp } from "./send-whatsapp";
import {
  handleWhatsAppAddMember,
  handleWhatsAppAddMembers,
  handleWhatsAppAddMemberTeam,
  handleWhatsAppCreateGroup,
  handleWhatsAppRemoveMember,
  handleWhatsAppRemoveMemberTeam,
} from "./whatsapp-group";

const DEAD_LETTER_QUEUE = "dead-letter";

const QUEUE_DEFAULTS: Omit<Queue, "name"> = {
  retryLimit: 3,
  retryDelay: 5,
  retryBackoff: true,
  expireInSeconds: 900, // 15 min
  deadLetter: DEAD_LETTER_QUEUE,
};

// Queues that need longer expiry or custom config
const QUEUE_OVERRIDES: Partial<
  Record<JobName | typeof DEAD_LETTER_QUEUE, Partial<Omit<Queue, "name">>>
> = {
  "create-recurring-events": { expireInSeconds: 1800 }, // 30 min — iterates all parent events
  "whatsapp-create-group": { expireInSeconds: 1800 },
};

// Low-traffic notification queues poll less frequently to reduce DB load
const NOTIFY_POLL: WorkOptions = { pollingIntervalSeconds: 5 };

export async function registerHandlers(boss: PgBoss): Promise<void> {
  // Dead letter queue first (other queues reference it) — no deadLetter on itself
  const { deadLetter: _, ...deadLetterDefaults } = QUEUE_DEFAULTS;
  await boss.createQueue(DEAD_LETTER_QUEUE, deadLetterDefaults);

  // Create all application queues
  for (const name of QUEUE_NAMES) {
    await boss.createQueue(name, {
      ...QUEUE_DEFAULTS,
      ...QUEUE_OVERRIDES[name],
    });
  }

  // Low-level handlers (default 2s polling — high priority)
  await boss.work("send-notification", handleSendNotification);
  await boss.work("send-bulk-notification", handleSendBulkNotification);
  await boss.work("send-whatsapp", handleSendWhatsApp);
  await boss.work("create-recurring-events", handleCreateRecurringEvents);
  await boss.work("send-scheduled-message", handleSendScheduledMessage);

  // Notification handlers (5s polling — burst traffic, not continuous)
  await boss.work(
    "notify-reimbursement-submitted",
    NOTIFY_POLL,
    handleNotifyReimbursementSubmitted
  );
  await boss.work(
    "notify-reimbursement-approved",
    NOTIFY_POLL,
    handleNotifyReimbursementApproved
  );
  await boss.work(
    "notify-reimbursement-rejected",
    NOTIFY_POLL,
    handleNotifyReimbursementRejected
  );

  await boss.work(
    "notify-advance-payment-submitted",
    NOTIFY_POLL,
    handleNotifyAdvancePaymentSubmitted
  );
  await boss.work(
    "notify-advance-payment-approved",
    NOTIFY_POLL,
    handleNotifyAdvancePaymentApproved
  );
  await boss.work(
    "notify-advance-payment-rejected",
    NOTIFY_POLL,
    handleNotifyAdvancePaymentRejected
  );

  await boss.work(
    "notify-vendor-payment-submitted",
    NOTIFY_POLL,
    handleNotifyVendorPaymentSubmitted
  );
  await boss.work(
    "notify-vendor-payment-approved",
    NOTIFY_POLL,
    handleNotifyVendorPaymentApproved
  );
  await boss.work(
    "notify-vendor-payment-rejected",
    NOTIFY_POLL,
    handleNotifyVendorPaymentRejected
  );
  await boss.work(
    "notify-vp-invoice-submitted",
    NOTIFY_POLL,
    handleNotifyVpInvoiceSubmitted
  );
  await boss.work(
    "notify-vp-invoice-approved",
    NOTIFY_POLL,
    handleNotifyVpInvoiceApproved
  );
  await boss.work(
    "notify-vp-invoice-rejected",
    NOTIFY_POLL,
    handleNotifyVpInvoiceRejected
  );

  await boss.work(
    "notify-vpt-submitted",
    NOTIFY_POLL,
    handleNotifyVptSubmitted
  );
  await boss.work("notify-vpt-approved", NOTIFY_POLL, handleNotifyVptApproved);
  await boss.work("notify-vpt-rejected", NOTIFY_POLL, handleNotifyVptRejected);

  await boss.work("notify-team-updated", NOTIFY_POLL, handleNotifyTeamUpdated);
  await boss.work("notify-team-deleted", NOTIFY_POLL, handleNotifyTeamDeleted);
  await boss.work("notify-added-to-team", NOTIFY_POLL, handleNotifyAddedToTeam);
  await boss.work(
    "notify-removed-from-team",
    NOTIFY_POLL,
    handleNotifyRemovedFromTeam
  );

  await boss.work(
    "notify-event-created",
    NOTIFY_POLL,
    handleNotifyEventCreated
  );
  await boss.work(
    "notify-event-updated",
    NOTIFY_POLL,
    handleNotifyEventUpdated
  );
  await boss.work(
    "notify-event-cancelled",
    NOTIFY_POLL,
    handleNotifyEventCancelled
  );
  await boss.work(
    "notify-added-to-event",
    NOTIFY_POLL,
    handleNotifyAddedToEvent
  );
  await boss.work(
    "notify-users-added-to-event",
    NOTIFY_POLL,
    handleNotifyUsersAddedToEvent
  );
  await boss.work(
    "notify-removed-from-event",
    NOTIFY_POLL,
    handleNotifyRemovedFromEvent
  );

  await boss.work(
    "notify-event-interest-received",
    NOTIFY_POLL,
    handleNotifyEventInterestReceived
  );
  await boss.work(
    "notify-event-interest-approved",
    NOTIFY_POLL,
    handleNotifyEventInterestApproved
  );
  await boss.work(
    "notify-event-interest-rejected",
    NOTIFY_POLL,
    handleNotifyEventInterestRejected
  );

  await boss.work(
    "notify-photo-approved",
    NOTIFY_POLL,
    handleNotifyPhotoApproved
  );
  await boss.work(
    "notify-photo-rejected",
    NOTIFY_POLL,
    handleNotifyPhotoRejected
  );

  await boss.work(
    "notify-event-update-posted",
    NOTIFY_POLL,
    handleNotifyEventUpdatePosted
  );
  await boss.work(
    "notify-event-feedback-open",
    NOTIFY_POLL,
    handleNotifyEventFeedbackOpen
  );

  // WhatsApp group management (default 2s polling — external API)
  await boss.work("whatsapp-create-group", handleWhatsAppCreateGroup);
  await boss.work("whatsapp-add-member", handleWhatsAppAddMember);
  await boss.work("whatsapp-add-members", handleWhatsAppAddMembers);
  await boss.work("whatsapp-remove-member", handleWhatsAppRemoveMember);
  await boss.work("whatsapp-add-member-team", handleWhatsAppAddMemberTeam);
  await boss.work(
    "whatsapp-remove-member-team",
    handleWhatsAppRemoveMemberTeam
  );
}
