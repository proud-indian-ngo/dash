import type { PgBoss, Queue, WorkOptions } from "pg-boss";
import { type JobName, QUEUE_NAMES } from "../enqueue";
import { handleCleanupStaleScheduledRecipients } from "./cleanup-stale-scheduled-recipients";
import { handleDeleteR2Object } from "./delete-r2-object";
import { handleGenerateCashVoucher } from "./generate-cash-voucher";
import { handleImmichDeleteAlbum } from "./immich-delete-album";
import { handleImmichDeleteAsset } from "./immich-delete-asset";
import { handleImmichSyncPhoto } from "./immich-sync-photo";
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
import {
  handleNotifyEventUpdateApproved,
  handleNotifyEventUpdatePending,
  handleNotifyEventUpdatePosted,
  handleNotifyEventUpdateRejected,
} from "./notify-event-update";
import {
  handleNotifyReimbursementApproved,
  handleNotifyReimbursementRejected,
  handleNotifyReimbursementSubmitted,
} from "./notify-reimbursement";
import {
  handleNotifyAddedToTeam,
  handleNotifyRemovedFromTeam,
  handleNotifyTeamDeleted,
  handleNotifyTeamRoleChanged,
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
  handleNotifyPasswordReset,
  handleNotifyRoleChanged,
  handleNotifyUserBanned,
  handleNotifyUserDeactivated,
  handleNotifyUserReactivated,
  handleNotifyUserUnbanned,
  handleNotifyUserWelcome,
} from "./notify-user-admin";
import {
  handleNotifyVendorApproved,
  handleNotifyVendorAutoApproved,
  handleNotifyVendorUnapproved,
} from "./notify-vendor";
import {
  handleNotifyVendorPaymentApproved,
  handleNotifyVendorPaymentRejected,
  handleNotifyVendorPaymentSubmitted,
  handleNotifyVpFullyPaid,
  handleNotifyVpInvoiceApproved,
  handleNotifyVpInvoiceRejected,
  handleNotifyVpInvoiceSubmitted,
  handleNotifyVptCascadeRejected,
} from "./notify-vendor-payment";
import {
  handleNotifyVptApproved,
  handleNotifyVptRejected,
  handleNotifyVptSubmitted,
} from "./notify-vendor-payment-transaction";
import { handleProcessEventReminders } from "./process-event-reminders";
import { handleProcessPostEventReminders } from "./process-post-event-reminders";
import { handleRemindFeedbackDeadline } from "./remind-feedback-deadline";
import { handleRemindPhotoApproval } from "./remind-photo-approval";
import { handleRemindStaleRequests } from "./remind-stale-requests";
import { handleScanWhatsAppGroups } from "./scan-whatsapp-groups";
import { handleSendBulkNotification } from "./send-bulk-notification";
import { handleSendNotification } from "./send-notification";
import { handleSendScheduledMessage } from "./send-scheduled-message";
import {
  handleDeadLetterScheduledWhatsApp,
  handleSendScheduledWhatsApp,
} from "./send-scheduled-whatsapp";
import { handleSendWeeklyEventsDigest } from "./send-weekly-events-digest";
import { handleSendWhatsApp } from "./send-whatsapp";
import { handleSyncCourierPreference } from "./sync-courier-preference";
import { handleSyncCourierUser, handleSyncWhatsAppStatus } from "./sync-user";
import {
  handleWhatsAppAddMember,
  handleWhatsAppAddMembers,
  handleWhatsAppAddMemberTeam,
  handleWhatsAppCreateGroup,
  handleWhatsAppManageOrientation,
  handleWhatsAppRemoveMember,
  handleWhatsAppRemoveMemberTeam,
} from "./whatsapp-group";

const DEAD_LETTER_QUEUE = "dead-letter";
const DEAD_LETTER_SCHEDULED_WHATSAPP = "dead-letter-scheduled-whatsapp";

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
  "immich-sync-photo": { expireInSeconds: 1800 },
  "whatsapp-create-group": { expireInSeconds: 1800 },
  "send-scheduled-whatsapp": { deadLetter: DEAD_LETTER_SCHEDULED_WHATSAPP },
};

// Low-traffic notification queues poll less frequently to reduce DB load
const NOTIFY_POLL: WorkOptions = { pollingIntervalSeconds: 5 };

export async function registerHandlers(boss: PgBoss): Promise<void> {
  // Dead letter queues first (other queues reference them) — no deadLetter on themselves
  const { deadLetter: _, ...deadLetterDefaults } = QUEUE_DEFAULTS;
  await boss.createQueue(DEAD_LETTER_QUEUE, deadLetterDefaults);
  await boss.createQueue(DEAD_LETTER_SCHEDULED_WHATSAPP, deadLetterDefaults);

  // Dead letter handler for scheduled WhatsApp — marks recipients as failed
  await boss.work(
    DEAD_LETTER_SCHEDULED_WHATSAPP,
    NOTIFY_POLL,
    handleDeadLetterScheduledWhatsApp
  );

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
  await boss.work("send-scheduled-message", handleSendScheduledMessage);
  await boss.work("send-scheduled-whatsapp", handleSendScheduledWhatsApp);

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
  await boss.work(
    "notify-vpt-cascade-rejected",
    NOTIFY_POLL,
    handleNotifyVptCascadeRejected
  );
  await boss.work("notify-vp-fully-paid", NOTIFY_POLL, handleNotifyVpFullyPaid);

  await boss.work(
    "notify-vendor-approved",
    NOTIFY_POLL,
    handleNotifyVendorApproved
  );
  await boss.work(
    "notify-vendor-unapproved",
    NOTIFY_POLL,
    handleNotifyVendorUnapproved
  );
  await boss.work(
    "notify-vendor-auto-approved",
    NOTIFY_POLL,
    handleNotifyVendorAutoApproved
  );

  await boss.work("notify-role-changed", NOTIFY_POLL, handleNotifyRoleChanged);
  await boss.work("notify-user-welcome", NOTIFY_POLL, handleNotifyUserWelcome);
  await boss.work("notify-user-banned", NOTIFY_POLL, handleNotifyUserBanned);
  await boss.work(
    "notify-user-unbanned",
    NOTIFY_POLL,
    handleNotifyUserUnbanned
  );
  await boss.work(
    "notify-password-reset",
    NOTIFY_POLL,
    handleNotifyPasswordReset
  );
  await boss.work(
    "notify-user-deactivated",
    NOTIFY_POLL,
    handleNotifyUserDeactivated
  );
  await boss.work(
    "notify-user-reactivated",
    NOTIFY_POLL,
    handleNotifyUserReactivated
  );

  await boss.work("notify-team-updated", NOTIFY_POLL, handleNotifyTeamUpdated);
  await boss.work("notify-team-deleted", NOTIFY_POLL, handleNotifyTeamDeleted);
  await boss.work("notify-added-to-team", NOTIFY_POLL, handleNotifyAddedToTeam);
  await boss.work(
    "notify-team-role-changed",
    NOTIFY_POLL,
    handleNotifyTeamRoleChanged
  );
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
    { ...NOTIFY_POLL, batchSize: 50 },
    handleNotifyPhotoApproved
  );
  await boss.work(
    "notify-photo-rejected",
    { ...NOTIFY_POLL, batchSize: 50 },
    handleNotifyPhotoRejected
  );

  await boss.work(
    "notify-event-update-posted",
    NOTIFY_POLL,
    handleNotifyEventUpdatePosted
  );
  await boss.work(
    "notify-event-update-approved",
    NOTIFY_POLL,
    handleNotifyEventUpdateApproved
  );
  await boss.work(
    "notify-event-update-rejected",
    NOTIFY_POLL,
    handleNotifyEventUpdateRejected
  );
  await boss.work(
    "notify-event-update-pending",
    NOTIFY_POLL,
    handleNotifyEventUpdatePending
  );
  await boss.work(
    "notify-event-feedback-open",
    NOTIFY_POLL,
    handleNotifyEventFeedbackOpen
  );

  // Scheduled reminder/cleanup handlers (cron-triggered)
  await boss.work(
    "cleanup-stale-scheduled-recipients",
    NOTIFY_POLL,
    handleCleanupStaleScheduledRecipients
  );
  await boss.work(
    "remind-stale-requests",
    NOTIFY_POLL,
    handleRemindStaleRequests
  );
  await boss.work(
    "remind-feedback-deadline",
    NOTIFY_POLL,
    handleRemindFeedbackDeadline
  );
  await boss.work(
    "remind-photo-approval",
    NOTIFY_POLL,
    handleRemindPhotoApproval
  );
  await boss.work(
    "scan-whatsapp-groups",
    NOTIFY_POLL,
    handleScanWhatsAppGroups
  );
  await boss.work(
    "process-event-reminders",
    NOTIFY_POLL,
    handleProcessEventReminders
  );
  await boss.work(
    "process-post-event-reminders",
    NOTIFY_POLL,
    handleProcessPostEventReminders
  );
  await boss.work(
    "send-weekly-events-digest",
    NOTIFY_POLL,
    handleSendWeeklyEventsDigest
  );

  // Immich + R2 handlers (5s polling — external API + object storage)
  await boss.work("immich-sync-photo", NOTIFY_POLL, handleImmichSyncPhoto);
  await boss.work("immich-delete-album", NOTIFY_POLL, handleImmichDeleteAlbum);
  await boss.work("immich-delete-asset", NOTIFY_POLL, handleImmichDeleteAsset);
  await boss.work("delete-r2-object", NOTIFY_POLL, handleDeleteR2Object);
  await boss.work(
    "generate-cash-voucher",
    NOTIFY_POLL,
    handleGenerateCashVoucher
  );

  // User sync handlers (5s polling — external API)
  await boss.work(
    "sync-courier-preference",
    NOTIFY_POLL,
    handleSyncCourierPreference
  );
  await boss.work("sync-courier-user", NOTIFY_POLL, handleSyncCourierUser);
  await boss.work(
    "sync-whatsapp-status",
    NOTIFY_POLL,
    handleSyncWhatsAppStatus
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
  await boss.work(
    "whatsapp-manage-orientation",
    NOTIFY_POLL,
    handleWhatsAppManageOrientation
  );
}
