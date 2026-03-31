import type {
  NotifyReimbursementApprovedPayload,
  NotifyReimbursementRejectedPayload,
  NotifyReimbursementSubmittedPayload,
} from "../enqueue";
import { createNotifyHandler } from "./create-handler";

export const handleNotifyReimbursementSubmitted =
  createNotifyHandler<NotifyReimbursementSubmittedPayload>(
    "notify-reimbursement-submitted",
    async () =>
      (await import("@pi-dash/notifications")).notifyReimbursementSubmitted
  );

export const handleNotifyReimbursementApproved =
  createNotifyHandler<NotifyReimbursementApprovedPayload>(
    "notify-reimbursement-approved",
    async () =>
      (await import("@pi-dash/notifications")).notifyReimbursementApproved
  );

export const handleNotifyReimbursementRejected =
  createNotifyHandler<NotifyReimbursementRejectedPayload>(
    "notify-reimbursement-rejected",
    async () =>
      (await import("@pi-dash/notifications")).notifyReimbursementRejected
  );
