import type { PgBoss, SendOptions } from "pg-boss";
import { ensureBossReady, getBoss } from "./boss-instance";
import type { JobName, JobPayloads } from "./types";

export type * from "./types";

export const QUEUE_NAMES: JobName[] = [
  "cleanup-notifications",
  "cleanup-stale-scheduled-recipients",
  "close-expired-rsvp-polls",
  "close-rsvp-poll-on-cancel",
  "delete-r2-object",
  "generate-cash-voucher",
  "immich-delete-album",
  "immich-delete-asset",
  "immich-sync-photo",
  "notify-added-to-event",
  "notify-added-to-team",
  "notify-advance-payment-approved",
  "notify-advance-payment-rejected",
  "notify-advance-payment-submitted",
  "notify-event-cancelled",
  "notify-event-created",
  "notify-event-feedback-open",
  "notify-event-interest-approved",
  "notify-event-interest-received",
  "notify-event-interest-rejected",
  "notify-event-volunteer-left",
  "notify-event-update-approved",
  "notify-event-update-pending",
  "notify-event-update-posted",
  "notify-event-update-rejected",
  "notify-event-updated",
  "notify-password-reset",
  "notify-photo-approved",
  "notify-photo-rejected",
  "notify-reimbursement-approved",
  "notify-reimbursement-rejected",
  "notify-reimbursement-submitted",
  "notify-removed-from-event",
  "notify-removed-from-team",
  "notify-role-changed",
  "notify-team-deleted",
  "notify-team-role-changed",
  "notify-team-updated",
  "notify-user-banned",
  "notify-user-deactivated",
  "notify-user-reactivated",
  "notify-user-unbanned",
  "notify-user-welcome",
  "notify-users-added-to-event",
  "notify-vendor-approved",
  "notify-vendor-auto-approved",
  "notify-vendor-payment-approved",
  "notify-vendor-payment-rejected",
  "notify-vendor-payment-submitted",
  "notify-vendor-unapproved",
  "notify-vp-fully-paid",
  "notify-vp-invoice-approved",
  "notify-vp-invoice-rejected",
  "notify-vp-invoice-submitted",
  "notify-vpt-approved",
  "notify-vpt-cascade-rejected",
  "notify-vpt-rejected",
  "notify-vpt-submitted",
  "process-event-reminders",
  "process-post-event-reminders",
  "send-event-rsvp-polls",
  "remind-feedback-deadline",
  "remind-photo-approval",
  "remind-stale-requests",
  "scan-whatsapp-groups",
  "send-bulk-notification",
  "send-single-rsvp-poll",
  "send-notification",
  "send-scheduled-message",
  "send-scheduled-whatsapp",
  "send-weekly-events-digest",
  "send-whatsapp",
  "sync-whatsapp-status",
  "whatsapp-add-member",
  "whatsapp-add-member-team",
  "whatsapp-add-members",
  "whatsapp-create-group",
  "whatsapp-manage-orientation",
  "whatsapp-remove-from-all-groups",
  "whatsapp-remove-member",
  "whatsapp-remove-member-team",
];

// -- Constants (read from process.env to avoid importing @pi-dash/env/server) --

export const PHOTO_NOTIFICATION_DELAY_SECONDS =
  Number(process.env.PHOTO_NOTIFICATION_DELAY_SECONDS) || 120;

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
