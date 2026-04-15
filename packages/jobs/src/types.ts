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
  reason?: string;
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
  eventWhatsappGroupId: string | null;
  teamWhatsappGroupId: string | null;
  updatedAt: number;
}

export interface NotifyEventUpdateApprovedPayload {
  authorId: string;
  eventId: string;
  eventName: string;
  eventUpdateId: string;
}

export interface NotifyEventUpdateRejectedPayload {
  authorId: string;
  eventId: string;
  eventName: string;
  eventUpdateId: string;
}

export interface NotifyEventUpdatePendingPayload {
  authorName: string;
  eventId: string;
  eventName: string;
  eventUpdateId: string;
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

// User Sync
export interface SyncCourierUserPayload {
  email: string;
  name: string;
  userId: string;
}
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
  r2Key: string;
}

export interface SyncCourierPreferencePayload {
  enabled: boolean;
  previousEmailEnabled: boolean;
  topicId: string;
  userId: string;
}

// -- Payload map ---------------------------------------------------------------

export interface JobPayloads {
  "cleanup-stale-scheduled-recipients": CleanupStaleScheduledRecipientsPayload;
  "close-expired-rsvp-polls": CloseExpiredRsvpPollsPayload;
  "close-rsvp-poll-on-cancel": CloseRsvpPollOnCancelPayload;
  "delete-r2-object": DeleteR2ObjectPayload;
  "generate-cash-voucher": GenerateCashVoucherPayload;
  "immich-delete-album": ImmichDeleteAlbumPayload;
  "immich-delete-asset": ImmichDeleteAssetPayload;
  "immich-sync-photo": ImmichSyncPhotoPayload;
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
  "notify-password-reset": NotifyPasswordResetPayload;
  "notify-photo-approved": NotifyPhotoApprovedPayload;
  "notify-photo-rejected": NotifyPhotoRejectedPayload;
  "notify-reimbursement-approved": NotifyReimbursementApprovedPayload;
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
  "process-post-event-reminders": ProcessPostEventRemindersPayload;
  "remind-feedback-deadline": RemindFeedbackDeadlinePayload;
  "remind-photo-approval": RemindPhotoApprovalPayload;
  "remind-stale-requests": RemindStaleRequestsPayload;
  "scan-whatsapp-groups": ScanWhatsAppGroupsPayload;
  "send-bulk-notification": BulkNotificationPayload;
  "send-event-rsvp-polls": SendEventRsvpPollsPayload;
  "send-notification": NotificationPayload;
  "send-scheduled-message": ScheduledMessagePayload;
  "send-scheduled-whatsapp": SendScheduledWhatsAppPayload;
  "send-single-rsvp-poll": SendSingleRsvpPollPayload;
  "send-weekly-events-digest": SendWeeklyEventsDigestPayload;
  "send-whatsapp": WhatsAppPayload;
  "sync-courier-preference": SyncCourierPreferencePayload;
  "sync-courier-user": SyncCourierUserPayload;
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
