import type { PgBoss, SendOptions } from "pg-boss";
import { ensureBossReady, getBoss } from "./boss";

// -- Low-level payload types ---------------------------------------------------

export interface NotificationPayload {
  body: string;
  clickAction?: string;
  emailBody?: string;
  idempotencyKey: string;
  imageUrl?: string;
  title: string;
  topicId: string;
  userId: string;
}

export interface BulkNotificationPayload {
  body: string;
  clickAction?: string;
  emailBody?: string;
  idempotencyKey: string;
  title: string;
  topicId: string;
  userIds: string[];
}

export interface WhatsAppPayload {
  imageUrl?: string;
  message: string;
  phone: string;
}

export interface RecurringEventsPayload {
  triggeredAt: string; // ISO timestamp
}

export interface ScheduledMessagePayload {
  body: string;
  clickAction?: string;
  emailBody?: string;
  title: string;
  topicId: string;
  userId: string;
}

// -- Domain-specific notification payloads ------------------------------------

// Reimbursement
export interface NotifyReimbursementSubmittedPayload {
  reimbursementId: string;
  submitterName: string;
  title: string;
}
export interface NotifyReimbursementApprovedPayload {
  approvalScreenshotKey?: string;
  note?: string;
  reimbursementId: string;
  submitterId: string;
  title: string;
}
export interface NotifyReimbursementRejectedPayload {
  reason: string;
  reimbursementId: string;
  submitterId: string;
  title: string;
}

// Advance Payment
export interface NotifyAdvancePaymentSubmittedPayload {
  advancePaymentId: string;
  submitterName: string;
  title: string;
}
export interface NotifyAdvancePaymentApprovedPayload {
  advancePaymentId: string;
  approvalScreenshotKey?: string;
  note?: string;
  submitterId: string;
  title: string;
}
export interface NotifyAdvancePaymentRejectedPayload {
  advancePaymentId: string;
  reason: string;
  submitterId: string;
  title: string;
}

// Vendor Payment
export interface NotifyVendorPaymentSubmittedPayload {
  submitterName: string;
  title: string;
  vendorPaymentId: string;
}
export interface NotifyVendorPaymentApprovedPayload {
  approvalScreenshotKey?: string;
  note?: string;
  submitterId: string;
  title: string;
  vendorPaymentId: string;
}
export interface NotifyVendorPaymentRejectedPayload {
  reason: string;
  submitterId: string;
  title: string;
  vendorPaymentId: string;
}

// Vendor Payment Invoice
export interface NotifyVpInvoiceSubmittedPayload {
  submitterName: string;
  timestamp: number;
  vendorPaymentId: string;
  vendorPaymentTitle: string;
}
export interface NotifyVpInvoiceApprovedPayload {
  note?: string;
  submitterId: string;
  vendorPaymentId: string;
  vendorPaymentTitle: string;
}
export interface NotifyVpInvoiceRejectedPayload {
  reason: string;
  submitterId: string;
  timestamp: number;
  vendorPaymentId: string;
  vendorPaymentTitle: string;
}

// Vendor Payment Transaction
export interface NotifyVptSubmittedPayload {
  amount: number;
  submitterName: string;
  transactionId: string;
  vendorPaymentId: string;
  vendorPaymentTitle: string;
}
export interface NotifyVptApprovedPayload {
  amount: number;
  note?: string;
  submitterId: string;
  transactionId: string;
  vendorPaymentId: string;
  vendorPaymentTitle: string;
}
export interface NotifyVptRejectedPayload {
  amount: number;
  reason: string;
  submitterId: string;
  transactionId: string;
  vendorPaymentId: string;
  vendorPaymentTitle: string;
}

// Team
export interface NotifyTeamUpdatedPayload {
  memberIds: string[];
  teamId: string;
  teamName: string;
  updatedAt: number;
}
export interface NotifyTeamDeletedPayload {
  deletedAt: number;
  memberIds: string[];
  teamName: string;
}
export interface NotifyAddedToTeamPayload {
  teamId: string;
  teamName: string;
  userId: string;
}
export interface NotifyRemovedFromTeamPayload {
  removedAt: number;
  teamName: string;
  userId: string;
}

// Team Event
export interface NotifyEventCreatedPayload {
  eventId: string;
  eventName: string;
  location: string | null;
  startTime: number;
  teamId: string;
  teamMemberIds: string[];
}
export interface NotifyEventUpdatedPayload {
  eventId: string;
  eventMemberIds: string[];
  eventName: string;
  location: string | null;
  startTime: number;
  teamId: string;
  updatedAt: number;
}
export interface NotifyEventCancelledPayload {
  cancelledAt: number;
  eventId: string;
  eventMemberIds: string[];
  eventName: string;
  teamId: string;
}
export interface NotifyAddedToEventPayload {
  eventId: string;
  eventName: string;
  location: string | null;
  startTime: number;
  teamId: string;
  userId: string;
}
export interface NotifyUsersAddedToEventPayload {
  eventId: string;
  eventName: string;
  location: string | null;
  startTime: number;
  teamId: string;
  userIds: string[];
}
export interface NotifyRemovedFromEventPayload {
  eventId: string;
  eventName: string;
  teamId: string;
  userId: string;
}

// Event Interest
export interface NotifyEventInterestReceivedPayload {
  eventId: string;
  eventName: string;
  leadUserIds: string[];
  teamId: string;
  volunteerName: string;
}
export interface NotifyEventInterestApprovedPayload {
  eventId: string;
  eventName: string;
  userId: string;
}
export interface NotifyEventInterestRejectedPayload {
  eventId: string;
  eventName: string;
  userId: string;
}

// Event Photo
export interface NotifyPhotoApprovedPayload {
  eventId: string;
  eventName: string;
  photoId: string;
  uploaderId: string;
}
export interface NotifyPhotoRejectedPayload {
  eventId: string;
  eventName: string;
  photoId: string;
  uploaderId: string;
}

// Event Update
export interface NotifyEventUpdatePostedPayload {
  authorName: string;
  eventId: string;
  eventMemberIds: string[];
  eventName: string;
  updatedAt: number;
}

// Event Feedback
export interface NotifyEventFeedbackOpenPayload {
  eventId: string;
  eventName: string;
  memberUserIds: string[];
}

// WhatsApp group management
export interface WhatsAppCreateGroupPayload {
  creatorUserId: string;
  entityId: string;
  entityType: "event" | "team";
  groupName: string;
}
export interface WhatsAppAddMemberPayload {
  groupId: string;
  userId: string;
}
export interface WhatsAppAddMembersPayload {
  groupId: string;
  userIds: string[];
}
export interface WhatsAppRemoveMemberPayload {
  groupId: string;
  userId: string;
}
export interface WhatsAppAddMemberTeamPayload {
  teamId: string;
  userId: string;
}
export interface WhatsAppRemoveMemberTeamPayload {
  teamId: string;
  userId: string;
}

// -- Payload map ---------------------------------------------------------------

export interface JobPayloads {
  "create-recurring-events": RecurringEventsPayload;
  "notify-added-to-event": NotifyAddedToEventPayload;
  "notify-added-to-team": NotifyAddedToTeamPayload;
  "notify-advance-payment-approved": NotifyAdvancePaymentApprovedPayload;
  "notify-advance-payment-rejected": NotifyAdvancePaymentRejectedPayload;
  "notify-advance-payment-submitted": NotifyAdvancePaymentSubmittedPayload;
  "notify-event-cancelled": NotifyEventCancelledPayload;
  "notify-event-created": NotifyEventCreatedPayload;
  "notify-event-feedback-open": NotifyEventFeedbackOpenPayload;
  "notify-event-interest-approved": NotifyEventInterestApprovedPayload;
  "notify-event-interest-received": NotifyEventInterestReceivedPayload;
  "notify-event-interest-rejected": NotifyEventInterestRejectedPayload;
  "notify-event-update-posted": NotifyEventUpdatePostedPayload;
  "notify-event-updated": NotifyEventUpdatedPayload;
  "notify-photo-approved": NotifyPhotoApprovedPayload;
  "notify-photo-rejected": NotifyPhotoRejectedPayload;
  "notify-reimbursement-approved": NotifyReimbursementApprovedPayload;
  "notify-reimbursement-rejected": NotifyReimbursementRejectedPayload;
  "notify-reimbursement-submitted": NotifyReimbursementSubmittedPayload;
  "notify-removed-from-event": NotifyRemovedFromEventPayload;
  "notify-removed-from-team": NotifyRemovedFromTeamPayload;
  "notify-team-deleted": NotifyTeamDeletedPayload;
  "notify-team-updated": NotifyTeamUpdatedPayload;
  "notify-users-added-to-event": NotifyUsersAddedToEventPayload;
  "notify-vendor-payment-approved": NotifyVendorPaymentApprovedPayload;
  "notify-vendor-payment-rejected": NotifyVendorPaymentRejectedPayload;
  "notify-vendor-payment-submitted": NotifyVendorPaymentSubmittedPayload;
  "notify-vp-invoice-approved": NotifyVpInvoiceApprovedPayload;
  "notify-vp-invoice-rejected": NotifyVpInvoiceRejectedPayload;
  "notify-vp-invoice-submitted": NotifyVpInvoiceSubmittedPayload;
  "notify-vpt-approved": NotifyVptApprovedPayload;
  "notify-vpt-rejected": NotifyVptRejectedPayload;
  "notify-vpt-submitted": NotifyVptSubmittedPayload;
  "send-bulk-notification": BulkNotificationPayload;
  "send-notification": NotificationPayload;
  "send-scheduled-message": ScheduledMessagePayload;
  "send-whatsapp": WhatsAppPayload;
  "whatsapp-add-member": WhatsAppAddMemberPayload;
  "whatsapp-add-member-team": WhatsAppAddMemberTeamPayload;
  "whatsapp-add-members": WhatsAppAddMembersPayload;
  "whatsapp-create-group": WhatsAppCreateGroupPayload;
  "whatsapp-remove-member": WhatsAppRemoveMemberPayload;
  "whatsapp-remove-member-team": WhatsAppRemoveMemberTeamPayload;
}

export type JobName = keyof JobPayloads;

export const QUEUE_NAMES: JobName[] = [
  "send-notification",
  "send-bulk-notification",
  "send-whatsapp",
  "create-recurring-events",
  "send-scheduled-message",
  "notify-reimbursement-submitted",
  "notify-reimbursement-approved",
  "notify-reimbursement-rejected",
  "notify-advance-payment-submitted",
  "notify-advance-payment-approved",
  "notify-advance-payment-rejected",
  "notify-vendor-payment-submitted",
  "notify-vendor-payment-approved",
  "notify-vendor-payment-rejected",
  "notify-vp-invoice-submitted",
  "notify-vp-invoice-approved",
  "notify-vp-invoice-rejected",
  "notify-vpt-submitted",
  "notify-vpt-approved",
  "notify-vpt-rejected",
  "notify-team-updated",
  "notify-team-deleted",
  "notify-added-to-team",
  "notify-removed-from-team",
  "notify-event-created",
  "notify-event-updated",
  "notify-event-cancelled",
  "notify-added-to-event",
  "notify-users-added-to-event",
  "notify-removed-from-event",
  "notify-event-interest-received",
  "notify-event-interest-approved",
  "notify-event-interest-rejected",
  "notify-photo-approved",
  "notify-photo-rejected",
  "notify-event-update-posted",
  "notify-event-feedback-open",
  "whatsapp-create-group",
  "whatsapp-add-member",
  "whatsapp-add-members",
  "whatsapp-remove-member",
  "whatsapp-add-member-team",
  "whatsapp-remove-member-team",
];

// -- Enqueue -------------------------------------------------------------------

export async function enqueue<T extends JobName>(
  name: T,
  data: JobPayloads[T],
  options?: SendOptions
): Promise<string | null> {
  let boss: PgBoss;
  try {
    boss = getBoss();
  } catch {
    boss = await ensureBossReady();
  }
  return await boss.send(name, data as object, options ?? {});
}
