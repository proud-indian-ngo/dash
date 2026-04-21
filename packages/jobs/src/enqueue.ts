import { getCurrentTraceId } from "@pi-dash/observability/trace-store";
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

export interface EnqueueOptions extends SendOptions {
  /** Explicit trace ID. Falls back to AsyncLocalStorage via getCurrentTraceId(). */
  traceId?: string;
}

/**
 * Enqueue a pg-boss job. Injects `__traceId` into the payload for end-to-end
 * trace correlation. Handlers extract and strip this field before passing
 * clean data to business logic (see create-handler.ts extractTraceId).
 */
export async function enqueue<T extends JobName>(
  name: T,
  data: JobPayloads[T],
  options?: EnqueueOptions
): Promise<string | null> {
  let boss: PgBoss;
  try {
    boss = getBoss();
  } catch {
    boss = await ensureBossReady();
  }
  const { traceId: explicitTraceId, ...sendOptions } = options ?? {};
  const resolvedTraceId = explicitTraceId ?? getCurrentTraceId();
  const payload = resolvedTraceId
    ? { ...(data as object), __traceId: resolvedTraceId }
    : (data as object);
  return await boss.send(name, payload, sendOptions);
}
