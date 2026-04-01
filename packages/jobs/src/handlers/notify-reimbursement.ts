import {
  notifyReimbursementApproved,
  notifyReimbursementRejected,
  notifyReimbursementSubmitted,
} from "@pi-dash/notifications";
import type {
  NotifyReimbursementApprovedPayload,
  NotifyReimbursementRejectedPayload,
  NotifyReimbursementSubmittedPayload,
} from "../enqueue";
import { createNotifyHandler } from "./create-handler";

export const handleNotifyReimbursementSubmitted =
  createNotifyHandler<NotifyReimbursementSubmittedPayload>(
    "notify-reimbursement-submitted",
    async () => notifyReimbursementSubmitted
  );

export const handleNotifyReimbursementApproved =
  createNotifyHandler<NotifyReimbursementApprovedPayload>(
    "notify-reimbursement-approved",
    async () => notifyReimbursementApproved
  );

export const handleNotifyReimbursementRejected =
  createNotifyHandler<NotifyReimbursementRejectedPayload>(
    "notify-reimbursement-rejected",
    async () => notifyReimbursementRejected
  );
