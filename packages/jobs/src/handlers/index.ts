import type { PgBoss, Queue, WorkOptions } from "pg-boss";

import { type JobName, QUEUE_NAMES } from "../enqueue";
import type {
  LedgerPostPendingPayload,
  LedgerPostSourcePayload,
} from "../types";
import { handleCleanupNotifications } from "./cleanup-notifications";
import { handleCleanupR2Orphans } from "./cleanup-r2-orphans";
import { handleCleanupStaleScheduledRecipients } from "./cleanup-stale-scheduled-recipients";
import { handleCloseExpiredRsvpPolls } from "./close-expired-rsvp-polls";
import { handleCloseRsvpPollOnCancel } from "./close-rsvp-poll-on-cancel";
import { withDefaultOutput } from "./create-handler";
import { handleDeleteR2Object } from "./delete-r2-object";
import { handleEnsureFiscalYears } from "./ensure-fiscal-years";
import { handleExpireEventInterests } from "./expire-event-interests";
import { handleExpireImportRows } from "./expire-import-rows";
import { handleFlushHeldNotifications } from "./flush-held-notifications";
import { handleGenerateCashVoucher } from "./generate-cash-voucher";
import { handleImmichDeleteAlbum } from "./immich-delete-album";
import { handleImmichDeleteAsset } from "./immich-delete-asset";
import { handleImmichSyncPhoto } from "./immich-sync-photo";
import { handleLedgerPostPending, handleLedgerPostSource } from "./ledger-post";
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
  handleNotifyEventVolunteerLeft,
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
  handleNotifyKalakritiGuardianReactivated,
  handleNotifyKalakritiRegistrationClosed,
  handleNotifyKalakritiRegistrationOpen,
  handleNotifyKalakritiScheduleChanged,
  handleNotifyKalakritiTransportChanged,
  handleRemindKalakritiRegistrationClose,
} from "./notify-kalakriti";
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
  handleNotifyKalakritiGuardianAccess,
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
import { handleSendContributionReceipt } from "./send-contribution-receipt";
import { handleSendEventRsvpPolls } from "./send-event-rsvp-polls";
import { handleSendNotification } from "./send-notification";
import { handleSendScheduledMessage } from "./send-scheduled-message";
import {
  handleDeadLetterScheduledWhatsApp,
  handleSendScheduledWhatsApp,
} from "./send-scheduled-whatsapp";
import { handleSendSingleRsvpPoll } from "./send-single-rsvp-poll";
import { handleSendWeeklyEventsDigest } from "./send-weekly-events-digest";
import { handleSendWhatsApp } from "./send-whatsapp";
import { handleSyncPublicEventsDeploy } from "./sync-public-events-deploy";
import { handleSyncWhatsAppStatus } from "./sync-user";
import {
  handleWhatsAppAddMember,
  handleWhatsAppAddMembers,
  handleWhatsAppAddMemberTeam,
  handleWhatsAppCreateGroup,
  handleWhatsAppManageOrientation,
  handleWhatsAppRemoveFromAllGroups,
  handleWhatsAppRemoveMember,
  handleWhatsAppRemoveMemberTeam,
} from "./whatsapp-group";

const DEAD_LETTER_QUEUE = "dead-letter";
const DEAD_LETTER_SCHEDULED_WHATSAPP = "dead-letter-scheduled-whatsapp";

const QUEUE_DEFAULTS: Omit<Queue, "name"> = {
  deadLetter: DEAD_LETTER_QUEUE,
  expireInSeconds: 900, // 15 min
  retryBackoff: true,
  retryDelay: 5,
  retryLimit: 3,
};

// Queues that need longer expiry or custom config
const QUEUE_OVERRIDES: Partial<
  Record<JobName | typeof DEAD_LETTER_QUEUE, Partial<Omit<Queue, "name">>>
> = {
  "cleanup-r2-orphans": { expireInSeconds: 3600 },
  // One queued or running flush at a time; a minute's run that finds one
  // busy is dropped. Not retried, with a heartbeat, so a dead worker frees
  // the slot within a minute or two. Each run sends only what it claimed,
  // and a run that outlives its expiry stops between groups, so runs don't
  // send the same batch; unsent claims pass to a later run after a lease.
  "flush-held-notifications": {
    heartbeatSeconds: 60,
    policy: "exclusive",
    retryLimit: 0,
  },
  // One queued and one active job per line item (singletonKey =
  // "voucher-<lineItemId>"), so repeated requests collapse and an edit made
  // while a voucher renders queues one more. pg-boss can't change an
  // existing queue's policy, so a queue created before this stays
  // "standard"; the job's commit check keeps duplicates harmless there.
  "generate-cash-voucher": { policy: "stately" },
  "immich-sync-photo": { expireInSeconds: 1800 },
  // One queued and one active job per payment (singletonKey = payment ID),
  // so repeated deliveries collapse. The worker is registered by the web
  // server, which owns the import rules (apps/web/server/plugins/jobs.ts).
  // One queued or running reconcile at a time (no singletonKey, so the
  // whole queue): a second send, scheduled or from Settings, is refused,
  // and runs never overlap. The worker sends a heartbeat every 30 seconds,
  // so a run whose process died fails within a minute or two instead of
  // looking busy until its 4-hour expiry; the handler stops itself before
  // that expiry, and a failed or expired run is not retried, so it never
  // runs alongside a new one.
  "razorpay-reconcile": {
    expireInSeconds: 4 * 60 * 60,
    heartbeatSeconds: 60,
    policy: "exclusive",
    retryLimit: 0,
  },
  // Income posting. One queued and one active job per source
  // (singletonKey = "type:id"), so a burst of edits collapses and an edit
  // made while a job runs queues one more.
  "ledger-post-source": { policy: "stately" },
  // One sweep running at a time (singleton), whoever asked for it: a
  // request made meanwhile waits its turn. The worker sends a heartbeat, so
  // only a dead run expires, and it is not retried (the next run covers
  // it), so an expiry never starts a second sweep alongside a live one.
  // The sweep stops itself after 45 minutes.
  "ledger-post-pending": {
    expireInSeconds: 60 * 60,
    heartbeatSeconds: 60,
    policy: "singleton",
    retryLimit: 0,
  },
  "razorpay-sync-payment": { policy: "stately" },
  // Keyed by refund ID. A refund whose payment is not imported yet is held
  // for it and the job ends; retries are for a refund the API does not show
  // as processed yet, or a failure (1 minute doubling to 1 hour).
  "razorpay-sync-refund": {
    policy: "stately",
    retryBackoff: true,
    retryDelay: 60,
    retryDelayMax: 60 * 60,
    retryLimit: 8,
  },
  // Keyed by settlement ID. Retries cover an API failure (1 minute
  // doubling to 1 hour); a settlement synced twice is recorded once.
  "razorpay-sync-settlement": {
    policy: "stately",
    retryBackoff: true,
    retryDelay: 60,
    retryDelayMax: 60 * 60,
    retryLimit: 8,
  },
  "send-scheduled-whatsapp": { deadLetter: DEAD_LETTER_SCHEDULED_WHATSAPP },
  "whatsapp-create-group": { expireInSeconds: 1800 },
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
    withDefaultOutput(handleDeadLetterScheduledWhatsApp)
  );

  // Create all application queues
  await Promise.all(
    QUEUE_NAMES.map(async (name) => {
      await boss.createQueue(name, {
        ...QUEUE_DEFAULTS,
        ...QUEUE_OVERRIDES[name],
      });
    })
  );

  // Low-level handlers (default 2s polling — high priority)
  await boss.work(
    "send-notification",
    withDefaultOutput(handleSendNotification)
  );
  await boss.work(
    "send-bulk-notification",
    withDefaultOutput(handleSendBulkNotification)
  );
  await boss.work("send-whatsapp", withDefaultOutput(handleSendWhatsApp));
  await boss.work(
    "send-contribution-receipt",
    NOTIFY_POLL,
    handleSendContributionReceipt
  );
  await boss.work(
    "send-scheduled-message",
    withDefaultOutput(handleSendScheduledMessage)
  );
  await boss.work(
    "send-scheduled-whatsapp",
    withDefaultOutput(handleSendScheduledWhatsApp)
  );

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
  await boss.work(
    "notify-kalakriti-guardian-access",
    NOTIFY_POLL,
    handleNotifyKalakritiGuardianAccess
  );
  await boss.work(
    "notify-kalakriti-guardian-reactivated",
    NOTIFY_POLL,
    handleNotifyKalakritiGuardianReactivated
  );
  await boss.work(
    "notify-kalakriti-registration-open",
    NOTIFY_POLL,
    handleNotifyKalakritiRegistrationOpen
  );
  await boss.work(
    "notify-kalakriti-registration-closed",
    NOTIFY_POLL,
    handleNotifyKalakritiRegistrationClosed
  );
  await boss.work(
    "notify-kalakriti-schedule-changed",
    NOTIFY_POLL,
    handleNotifyKalakritiScheduleChanged
  );
  await boss.work(
    "notify-kalakriti-transport-changed",
    NOTIFY_POLL,
    handleNotifyKalakritiTransportChanged
  );
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
    "notify-event-volunteer-left",
    NOTIFY_POLL,
    handleNotifyEventVolunteerLeft
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
    "cleanup-notifications",
    NOTIFY_POLL,
    withDefaultOutput(handleCleanupNotifications)
  );
  await boss.work(
    "ensure-fiscal-years",
    NOTIFY_POLL,
    withDefaultOutput(handleEnsureFiscalYears)
  );
  await boss.work<LedgerPostSourcePayload>(
    "ledger-post-source",
    NOTIFY_POLL,
    withDefaultOutput((jobs) => handleLedgerPostSource(jobs))
  );
  await boss.work<LedgerPostPendingPayload>(
    "ledger-post-pending",
    NOTIFY_POLL,
    withDefaultOutput((jobs) => handleLedgerPostPending(jobs))
  );
  await boss.work(
    "flush-held-notifications",
    NOTIFY_POLL,
    withDefaultOutput(handleFlushHeldNotifications)
  );
  await boss.work(
    "expire-import-rows",
    NOTIFY_POLL,
    withDefaultOutput((jobs) => handleExpireImportRows(jobs))
  );
  await boss.work(
    "sync-public-events-deploy",
    NOTIFY_POLL,
    withDefaultOutput(handleSyncPublicEventsDeploy)
  );
  await boss.work(
    "cleanup-r2-orphans",
    NOTIFY_POLL,
    withDefaultOutput(handleCleanupR2Orphans)
  );
  await boss.work(
    "cleanup-stale-scheduled-recipients",
    NOTIFY_POLL,
    withDefaultOutput(handleCleanupStaleScheduledRecipients)
  );
  await boss.work(
    "remind-stale-requests",
    NOTIFY_POLL,
    withDefaultOutput(handleRemindStaleRequests)
  );
  await boss.work(
    "remind-feedback-deadline",
    NOTIFY_POLL,
    withDefaultOutput(handleRemindFeedbackDeadline)
  );
  await boss.work(
    "remind-kalakriti-registration-close",
    NOTIFY_POLL,
    handleRemindKalakritiRegistrationClose
  );
  await boss.work(
    "remind-photo-approval",
    NOTIFY_POLL,
    withDefaultOutput(handleRemindPhotoApproval)
  );
  await boss.work(
    "scan-whatsapp-groups",
    NOTIFY_POLL,
    withDefaultOutput(handleScanWhatsAppGroups)
  );
  await boss.work(
    "process-event-reminders",
    NOTIFY_POLL,
    withDefaultOutput(handleProcessEventReminders)
  );
  await boss.work(
    "process-post-event-reminders",
    NOTIFY_POLL,
    withDefaultOutput(handleProcessPostEventReminders)
  );
  await boss.work(
    "send-event-rsvp-polls",
    NOTIFY_POLL,
    withDefaultOutput(handleSendEventRsvpPolls)
  );
  await boss.work(
    "send-single-rsvp-poll",
    NOTIFY_POLL,
    withDefaultOutput(handleSendSingleRsvpPoll)
  );
  await boss.work(
    "close-expired-rsvp-polls",
    NOTIFY_POLL,
    withDefaultOutput(handleCloseExpiredRsvpPolls)
  );
  await boss.work(
    "expire-event-interests",
    NOTIFY_POLL,
    withDefaultOutput((jobs) => handleExpireEventInterests(jobs))
  );
  await boss.work(
    "close-rsvp-poll-on-cancel",
    NOTIFY_POLL,
    withDefaultOutput(handleCloseRsvpPollOnCancel)
  );
  await boss.work(
    "send-weekly-events-digest",
    NOTIFY_POLL,
    withDefaultOutput(handleSendWeeklyEventsDigest)
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
    "sync-whatsapp-status",
    NOTIFY_POLL,
    handleSyncWhatsAppStatus
  );

  // WhatsApp group management (default 2s polling — external API)
  await boss.work(
    "whatsapp-create-group",
    withDefaultOutput(handleWhatsAppCreateGroup)
  );
  await boss.work(
    "whatsapp-add-member",
    withDefaultOutput(handleWhatsAppAddMember)
  );
  await boss.work(
    "whatsapp-add-members",
    withDefaultOutput(handleWhatsAppAddMembers)
  );
  await boss.work(
    "whatsapp-remove-member",
    withDefaultOutput(handleWhatsAppRemoveMember)
  );
  await boss.work(
    "whatsapp-add-member-team",
    withDefaultOutput(handleWhatsAppAddMemberTeam)
  );
  await boss.work(
    "whatsapp-remove-member-team",
    withDefaultOutput(handleWhatsAppRemoveMemberTeam)
  );
  await boss.work(
    "whatsapp-remove-from-all-groups",
    withDefaultOutput(handleWhatsAppRemoveFromAllGroups)
  );
  await boss.work(
    "whatsapp-manage-orientation",
    NOTIFY_POLL,
    withDefaultOutput(handleWhatsAppManageOrientation)
  );
}
