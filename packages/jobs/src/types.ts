import type { VendorPaymentNoInvoiceReason } from "@pi-dash/shared/constants";

// -- Low-level payload types ---------------------------------------------------

export interface NotificationPayload {
  body: string;
  clickAction?: string;
  emailHtml?: string;
  idempotencyKey: string;
  imageUrl?: string;
  title: string;
  topicId: string;
  userId: string;
}

export interface BulkNotificationPayload {
  body: string;
  clickAction?: string;
  emailHtml?: string;
  idempotencyKey: string;
  title: string;
  topicId: string;
  userIds: string[];
}

export interface WhatsAppPayload {
  /** Forwarded to the WhatsApp gateway so a retried job sends once. */
  idempotencyKey?: string;
  imageUrl?: string;
  message: string;
  phone: string;
}

export interface ScheduledMessagePayload {
  body: string;
  clickAction?: string;
  emailHtml?: string;
  title: string;
  topicId: string;
  userId: string;
}

export interface SendScheduledWhatsAppPayload {
  attachments?: Array<{ fileName: string; mimeType: string; r2Key: string }>;
  enqueuedAt: number;
  message: string;
  recipientRowId: string;
  recipientType: "group" | "user";
  scheduledMessageId: string;
  targetAddress: string;
}

// -- Domain-specific notification payloads ------------------------------------

// Reimbursement
export interface NotifyReimbursementSubmittedPayload {
  reimbursementId: string;
  submitterName: string;
  title: string;
}
export interface NotifyReimbursementApprovedPayload {
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
/** Finance raised a reimbursement on the claimant's behalf. */
export interface NotifyReimbursementRaisedForYouPayload {
  claimantId: string;
  raisedByName: string;
  reimbursementId: string;
  title: string;
}
/** Finance moved a reimbursement from one claimant to another. */
export interface NotifyReimbursementClaimantChangedPayload {
  /** The mutator's timestamp, so each change notifies once. */
  changedAt: number;
  changedByName: string;
  newClaimantId: string;
  newClaimantName: string;
  previousClaimantId: string;
  reason: string;
  reimbursementId: string;
  title: string;
}

// Event interest lifecycle
export type ExpireEventInterestsPayload = Record<string, never>;

// RSVP Poll Lifecycle
export interface CloseExpiredRsvpPollsPayload {
  triggeredAt: string;
}

export interface CloseRsvpPollOnCancelPayload {
  eventId: string;
  eventName: string;
  reason?: string;
}

// Cash Voucher
export interface GenerateCashVoucherPayload {
  approverUserId: string;
  lineItemId: string;
  reimbursementId: string;
}

// Donation receipt email (manual "Email receipt"); IDs only.
export interface SendContributionReceiptPayload {
  receiptId: string;
  /** One per click, so a deliberate resend is a new email but a retry is not. */
  requestId: string;
}

// Advance Payment
export interface NotifyAdvancePaymentSubmittedPayload {
  advancePaymentId: string;
  submitterName: string;
  title: string;
}
export interface NotifyAdvancePaymentApprovedPayload {
  advancePaymentId: string;
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

// Vendor Payment Invoice. `noInvoiceReason` is set when the request closes
// without an invoice, so the copy can say so.
export interface NotifyVpInvoiceSubmittedPayload {
  noInvoiceReason?: VendorPaymentNoInvoiceReason;
  /** Number of invoice-purpose proof attachments on a no-invoice submission. */
  proofAttachmentCount?: number;
  submitterName: string;
  timestamp: number;
  vendorPaymentId: string;
  vendorPaymentTitle: string;
}
export interface NotifyVpInvoiceApprovedPayload {
  noInvoiceReason?: VendorPaymentNoInvoiceReason;
  note?: string;
  submitterId: string;
  vendorPaymentId: string;
  vendorPaymentTitle: string;
}
export interface NotifyVpInvoiceRejectedPayload {
  noInvoiceReason?: VendorPaymentNoInvoiceReason;
  reason: string;
  submitterId: string;
  timestamp: number;
  vendorPaymentId: string;
  vendorPaymentTitle: string;
}

// Vendor Payment Transaction
// TODO(remove after the paise release): drop the legacy rupee `amount` and make
// `amountPaise` required. New jobs carry `amountPaise` only; `amount` is read
// from jobs enqueued by the previous build.
interface VptAmountPayload {
  /** @deprecated Rupees, from jobs enqueued before the paise release. */
  amount?: number;
  amountPaise?: number;
}
export interface NotifyVptSubmittedPayload extends VptAmountPayload {
  submitterName: string;
  transactionId: string;
  vendorPaymentId: string;
  vendorPaymentTitle: string;
}
export interface NotifyVptApprovedPayload extends VptAmountPayload {
  note?: string;
  submitterId: string;
  transactionId: string;
  vendorPaymentId: string;
  vendorPaymentTitle: string;
}
export interface NotifyVptRejectedPayload extends VptAmountPayload {
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
  reason?: string;
  teamId: string;
}
export interface NotifyAddedToEventPayload {
  eventId: string;
  eventName: string;
  location: string | null;
  startTime: number;
  userId: string;
}
export interface NotifyUsersAddedToEventPayload {
  eventId: string;
  eventName: string;
  location: string | null;
  startTime: number;
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
export interface NotifyEventVolunteerLeftPayload {
  eventId: string;
  eventName: string;
  leadUserIds: string[];
  leftAt: number;
  teamId: string;
  volunteerName: string;
  volunteerUserId: string;
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
  eventWhatsappGroupId: string | null;
  startTime: number;
  teamWhatsappGroupId: string | null;
  updatedAt: number;
}

export interface NotifyEventUpdateApprovedPayload {
  authorId: string;
  eventId: string;
  eventName: string;
  eventUpdateId: string;
  startTime: number;
}

export interface NotifyEventUpdateRejectedPayload {
  authorId: string;
  eventId: string;
  eventName: string;
  eventUpdateId: string;
  startTime: number;
}

export interface NotifyEventUpdatePendingPayload {
  authorName: string;
  eventId: string;
  eventName: string;
  eventUpdateId: string;
  startTime: number;
  teamId: string;
}

// Event Feedback
export interface NotifyEventFeedbackOpenPayload {
  eventId: string;
  eventName: string;
  memberUserIds: string[];
}

// Vendor
export interface NotifyVendorApprovedPayload {
  creatorId: string;
  vendorId: string;
  vendorName: string;
}
export interface NotifyVendorUnapprovedPayload {
  creatorId: string;
  vendorId: string;
  vendorName: string;
}
export interface NotifyVendorAutoApprovedPayload {
  creatorId: string;
  vendorId: string;
  vendorName: string;
  vendorPaymentTitle: string;
}

// Vendor Payment (additional)
export interface NotifyVpFullyPaidPayload {
  submitterId: string;
  title: string;
  vendorPaymentId: string;
}
export interface NotifyVptCascadeRejectedPayload {
  rejectionReason: string;
  submitterId: string;
  title: string;
  transactionCount: number;
  vendorPaymentId: string;
}

// User Admin
export interface NotifyRoleChangedPayload {
  newRole: string;
  userId: string;
}
export interface NotifyUserWelcomePayload {
  email: string;
  name: string;
  userId: string;
}
export interface NotifyUserBannedPayload {
  reason?: string;
  userId: string;
}
export interface NotifyUserUnbannedPayload {
  userId: string;
}
export interface NotifyPasswordResetPayload {
  userId: string;
}
export interface NotifyUserDeactivatedPayload {
  userId: string;
}
export interface NotifyUserReactivatedPayload {
  userId: string;
}
export interface NotifyKalakritiGuardianAccessPayload {
  editionName: string;
  membershipId: string;
  reusedIdentity: boolean;
  userId: string;
  year: number;
}

export interface NotifyKalakritiRegistrationPayload {
  editionId: string;
  transitionId: string;
}

export interface RemindKalakritiRegistrationClosePayload {
  editionId: string;
  plannedRegistrationCloseAt: number;
}

export interface NotifyKalakritiScheduleChangedPayload {
  centerIds: string[];
  competitionIds: string[];
  editionId: string;
  revision: string;
}

export interface NotifyKalakritiTransportChangedPayload {
  assignmentId: string;
  centerId: string;
  changeId: string;
  editionId: string;
}

export interface NotifyKalakritiGuardianReactivatedPayload {
  editionId: string;
  membershipId: string;
  userId: string;
}

// User Sync
export interface SyncWhatsAppStatusPayload {
  phone: string | null;
  userId: string;
}
export interface WhatsAppManageOrientationPayload {
  isOriented: boolean;
  userId: string;
}

// Team (additional)
export interface NotifyTeamRoleChangedPayload {
  newRole: string;
  teamId: string;
  teamName: string;
  userId: string;
}

// Scheduled Reminders
export interface CleanupStaleScheduledRecipientsPayload {
  triggeredAt: string;
}

export interface RemindStaleRequestsPayload {
  triggeredAt: string;
}
export interface RemindFeedbackDeadlinePayload {
  triggeredAt: string;
}
export interface RemindPhotoApprovalPayload {
  triggeredAt: string;
}

export interface ProcessEventRemindersPayload {
  triggeredAt: string;
}

export interface ProcessPostEventRemindersPayload {
  triggeredAt: string;
}

export interface SendEventRsvpPollsPayload {
  triggeredAt: string;
}

export interface SendSingleRsvpPollPayload {
  eventId: string;
}

export interface SendWeeklyEventsDigestPayload {
  triggeredAt: string;
}
export interface ScanWhatsAppGroupsPayload {
  triggeredAt: string;
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
export interface WhatsAppRemoveFromAllGroupsPayload {
  groupJids: string[];
  phone: string;
}

// -- Infrastructure job payloads -----------------------------------------------

export interface ImmichSyncPhotoPayload {
  eventId: string;
  eventName: string;
  photoId: string;
  r2Key: string;
}

export interface ImmichDeleteAssetPayload {
  immichAssetId: string;
}

export interface ImmichDeleteAlbumPayload {
  immichAlbumId: string;
}

export interface DeleteR2ObjectPayload {
  mode: "if-unreferenced" | "temporary-source";
  r2Key: string;
}

export interface CleanupR2OrphansPayload {
  dryRun?: boolean;
}

// -- Payload map ---------------------------------------------------------------

/**
 * A Razorpay payment to record. Only the ID and its India day travel in the
 * job; the payment itself is staged in private.import_row.
 */
export interface RazorpaySyncPaymentPayload {
  /**
   * yyyy-MM-dd, the India day of the payment's creation. Absent when the
   * webhook could not read the payment; the job then fetches it by ID.
   */
  day?: string;
  paymentId: string;
}

/**
 * A Razorpay refund to apply, keyed by refund ID. `copy` is the verified
 * webhook's amount, time and status, used when no API key secret is set;
 * with one the job fetches the refund. IDs, an amount and times only.
 */
export interface RazorpaySyncRefundPayload {
  copy?: {
    amount: number;
    /** Unix seconds. */
    createdAt: number;
    currency: string;
    status: string;
  };
  paymentId: string;
  refundId: string;
}

/**
 * A Razorpay reconcile run over India days `from` to `to` (yyyy-MM-dd,
 * both included). The schedule sends no days: the run then takes the last
 * three days.
 */
export interface RazorpayReconcilePayload {
  from?: string;
  reason: "backfill" | "manual" | "scheduled";
  to?: string;
}

/**
 * A Razorpay settlement to record, keyed by settlement ID: queued by a
 * signed `settlement.processed` webhook. The job fetches the settlement and
 * its lines from the API (key secret only).
 */
export interface RazorpaySyncSettlementPayload {
  settlementId: string;
}

/**
 * One source to bring into the books, keyed by source: income (finance
 * layer 3-2) or expenses (layer 3-3a: reimbursements, vendor payment
 * requests and their payments).
 */
export interface LedgerPostSourcePayload {
  sourceId: string;
  sourceType:
    | "contribution"
    | "contribution_refund"
    | "gateway_settlement"
    | "other_income"
    | "reimbursement"
    | "statement_transfer"
    | "vendor_payment"
    | "vendor_payment_transaction";
}

/**
 * The posting sweep: every income and expense source not up to date in the books. Run
 * daily, after bulk imports, and by "Post pending" when the page ran out of
 * time; `actorId` is the person who asked, if anyone.
 */
export interface LedgerPostPendingPayload {
  actorId?: string;
  /**
   * Look at every source, not only those that may have changed since
   * their last look. The Sunday scheduled run is full.
   */
  full?: boolean;
  reason: "after_import" | "manual" | "scheduled";
}

export interface JobPayloads {
  "cleanup-notifications": Record<string, never>;
  "cleanup-r2-orphans": CleanupR2OrphansPayload;
  "cleanup-stale-scheduled-recipients": CleanupStaleScheduledRecipientsPayload;
  "close-expired-rsvp-polls": CloseExpiredRsvpPollsPayload;
  "close-rsvp-poll-on-cancel": CloseRsvpPollOnCancelPayload;
  "delete-r2-object": DeleteR2ObjectPayload;
  "ensure-fiscal-years": Record<string, never>;
  "expire-event-interests": ExpireEventInterestsPayload;
  "expire-import-rows": Record<string, never>;
  "flush-held-notifications": Record<string, never>;
  "generate-cash-voucher": GenerateCashVoucherPayload;
  "immich-delete-album": ImmichDeleteAlbumPayload;
  "immich-delete-asset": ImmichDeleteAssetPayload;
  "immich-sync-photo": ImmichSyncPhotoPayload;
  "ledger-post-pending": LedgerPostPendingPayload;
  "ledger-post-source": LedgerPostSourcePayload;
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
  "notify-event-update-approved": NotifyEventUpdateApprovedPayload;
  "notify-event-update-pending": NotifyEventUpdatePendingPayload;
  "notify-event-update-posted": NotifyEventUpdatePostedPayload;
  "notify-event-update-rejected": NotifyEventUpdateRejectedPayload;
  "notify-event-updated": NotifyEventUpdatedPayload;
  "notify-event-volunteer-left": NotifyEventVolunteerLeftPayload;
  "notify-kalakriti-guardian-access": NotifyKalakritiGuardianAccessPayload;
  "notify-kalakriti-guardian-reactivated": NotifyKalakritiGuardianReactivatedPayload;
  "notify-kalakriti-registration-closed": NotifyKalakritiRegistrationPayload;
  "notify-kalakriti-registration-open": NotifyKalakritiRegistrationPayload;
  "notify-kalakriti-schedule-changed": NotifyKalakritiScheduleChangedPayload;
  "notify-kalakriti-transport-changed": NotifyKalakritiTransportChangedPayload;
  "notify-password-reset": NotifyPasswordResetPayload;
  "notify-photo-approved": NotifyPhotoApprovedPayload;
  "notify-photo-rejected": NotifyPhotoRejectedPayload;
  "notify-reimbursement-approved": NotifyReimbursementApprovedPayload;
  "notify-reimbursement-claimant-changed": NotifyReimbursementClaimantChangedPayload;
  "notify-reimbursement-raised-for-you": NotifyReimbursementRaisedForYouPayload;
  "notify-reimbursement-rejected": NotifyReimbursementRejectedPayload;
  "notify-reimbursement-submitted": NotifyReimbursementSubmittedPayload;
  "notify-removed-from-event": NotifyRemovedFromEventPayload;
  "notify-removed-from-team": NotifyRemovedFromTeamPayload;
  "notify-role-changed": NotifyRoleChangedPayload;
  "notify-team-deleted": NotifyTeamDeletedPayload;
  "notify-team-role-changed": NotifyTeamRoleChangedPayload;
  "notify-team-updated": NotifyTeamUpdatedPayload;
  "notify-user-banned": NotifyUserBannedPayload;
  "notify-user-deactivated": NotifyUserDeactivatedPayload;
  "notify-user-reactivated": NotifyUserReactivatedPayload;
  "notify-user-unbanned": NotifyUserUnbannedPayload;
  "notify-user-welcome": NotifyUserWelcomePayload;
  "notify-users-added-to-event": NotifyUsersAddedToEventPayload;
  "notify-vendor-approved": NotifyVendorApprovedPayload;
  "notify-vendor-auto-approved": NotifyVendorAutoApprovedPayload;
  "notify-vendor-payment-approved": NotifyVendorPaymentApprovedPayload;
  "notify-vendor-payment-rejected": NotifyVendorPaymentRejectedPayload;
  "notify-vendor-payment-submitted": NotifyVendorPaymentSubmittedPayload;
  "notify-vendor-unapproved": NotifyVendorUnapprovedPayload;
  "notify-vp-fully-paid": NotifyVpFullyPaidPayload;
  "notify-vp-invoice-approved": NotifyVpInvoiceApprovedPayload;
  "notify-vp-invoice-rejected": NotifyVpInvoiceRejectedPayload;
  "notify-vp-invoice-submitted": NotifyVpInvoiceSubmittedPayload;
  "notify-vpt-approved": NotifyVptApprovedPayload;
  "notify-vpt-cascade-rejected": NotifyVptCascadeRejectedPayload;
  "notify-vpt-rejected": NotifyVptRejectedPayload;
  "notify-vpt-submitted": NotifyVptSubmittedPayload;
  "process-event-reminders": ProcessEventRemindersPayload;
  "razorpay-reconcile": RazorpayReconcilePayload;
  "razorpay-sync-payment": RazorpaySyncPaymentPayload;
  "razorpay-sync-refund": RazorpaySyncRefundPayload;
  "razorpay-sync-settlement": RazorpaySyncSettlementPayload;
  "process-post-event-reminders": ProcessPostEventRemindersPayload;
  "remind-feedback-deadline": RemindFeedbackDeadlinePayload;
  "remind-kalakriti-registration-close": RemindKalakritiRegistrationClosePayload;
  "remind-photo-approval": RemindPhotoApprovalPayload;
  "remind-stale-requests": RemindStaleRequestsPayload;
  "scan-whatsapp-groups": ScanWhatsAppGroupsPayload;
  "send-bulk-notification": BulkNotificationPayload;
  "send-contribution-receipt": SendContributionReceiptPayload;
  "send-event-rsvp-polls": SendEventRsvpPollsPayload;
  "send-notification": NotificationPayload;
  "send-scheduled-message": ScheduledMessagePayload;
  "send-scheduled-whatsapp": SendScheduledWhatsAppPayload;
  "send-single-rsvp-poll": SendSingleRsvpPollPayload;
  "send-weekly-events-digest": SendWeeklyEventsDigestPayload;
  "send-whatsapp": WhatsAppPayload;
  "sync-public-events-deploy": Record<string, never>;
  "sync-whatsapp-status": SyncWhatsAppStatusPayload;
  "whatsapp-add-member": WhatsAppAddMemberPayload;
  "whatsapp-add-member-team": WhatsAppAddMemberTeamPayload;
  "whatsapp-add-members": WhatsAppAddMembersPayload;
  "whatsapp-create-group": WhatsAppCreateGroupPayload;
  "whatsapp-manage-orientation": WhatsAppManageOrientationPayload;
  "whatsapp-remove-from-all-groups": WhatsAppRemoveFromAllGroupsPayload;
  "whatsapp-remove-member": WhatsAppRemoveMemberPayload;
  "whatsapp-remove-member-team": WhatsAppRemoveMemberTeamPayload;
}

export type JobName = keyof JobPayloads;
