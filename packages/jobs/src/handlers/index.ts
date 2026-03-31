import type PgBoss from "pg-boss";
import { QUEUE_NAMES } from "../enqueue";
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

export async function registerHandlers(boss: PgBoss): Promise<void> {
  // Create all queues
  for (const name of QUEUE_NAMES) {
    await boss.createQueue(name);
  }

  // Low-level handlers
  await boss.work("send-notification", handleSendNotification);
  await boss.work("send-bulk-notification", handleSendBulkNotification);
  await boss.work("send-whatsapp", handleSendWhatsApp);
  await boss.work("create-recurring-events", handleCreateRecurringEvents);
  await boss.work("send-scheduled-message", handleSendScheduledMessage);

  // Reimbursement
  await boss.work(
    "notify-reimbursement-submitted",
    handleNotifyReimbursementSubmitted
  );
  await boss.work(
    "notify-reimbursement-approved",
    handleNotifyReimbursementApproved
  );
  await boss.work(
    "notify-reimbursement-rejected",
    handleNotifyReimbursementRejected
  );

  // Advance Payment
  await boss.work(
    "notify-advance-payment-submitted",
    handleNotifyAdvancePaymentSubmitted
  );
  await boss.work(
    "notify-advance-payment-approved",
    handleNotifyAdvancePaymentApproved
  );
  await boss.work(
    "notify-advance-payment-rejected",
    handleNotifyAdvancePaymentRejected
  );

  // Vendor Payment
  await boss.work(
    "notify-vendor-payment-submitted",
    handleNotifyVendorPaymentSubmitted
  );
  await boss.work(
    "notify-vendor-payment-approved",
    handleNotifyVendorPaymentApproved
  );
  await boss.work(
    "notify-vendor-payment-rejected",
    handleNotifyVendorPaymentRejected
  );
  await boss.work(
    "notify-vp-invoice-submitted",
    handleNotifyVpInvoiceSubmitted
  );
  await boss.work("notify-vp-invoice-approved", handleNotifyVpInvoiceApproved);
  await boss.work("notify-vp-invoice-rejected", handleNotifyVpInvoiceRejected);

  // Vendor Payment Transaction
  await boss.work("notify-vpt-submitted", handleNotifyVptSubmitted);
  await boss.work("notify-vpt-approved", handleNotifyVptApproved);
  await boss.work("notify-vpt-rejected", handleNotifyVptRejected);

  // Team
  await boss.work("notify-team-updated", handleNotifyTeamUpdated);
  await boss.work("notify-team-deleted", handleNotifyTeamDeleted);
  await boss.work("notify-added-to-team", handleNotifyAddedToTeam);
  await boss.work("notify-removed-from-team", handleNotifyRemovedFromTeam);

  // Team Event
  await boss.work("notify-event-created", handleNotifyEventCreated);
  await boss.work("notify-event-updated", handleNotifyEventUpdated);
  await boss.work("notify-event-cancelled", handleNotifyEventCancelled);
  await boss.work("notify-added-to-event", handleNotifyAddedToEvent);
  await boss.work("notify-users-added-to-event", handleNotifyUsersAddedToEvent);
  await boss.work("notify-removed-from-event", handleNotifyRemovedFromEvent);

  // Event Interest
  await boss.work(
    "notify-event-interest-received",
    handleNotifyEventInterestReceived
  );
  await boss.work(
    "notify-event-interest-approved",
    handleNotifyEventInterestApproved
  );
  await boss.work(
    "notify-event-interest-rejected",
    handleNotifyEventInterestRejected
  );

  // Event Photo
  await boss.work("notify-photo-approved", handleNotifyPhotoApproved);
  await boss.work("notify-photo-rejected", handleNotifyPhotoRejected);

  // Event Update
  await boss.work("notify-event-update-posted", handleNotifyEventUpdatePosted);

  // Event Feedback
  await boss.work("notify-event-feedback-open", handleNotifyEventFeedbackOpen);

  // WhatsApp group management
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
