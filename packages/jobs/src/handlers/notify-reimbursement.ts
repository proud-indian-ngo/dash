import {
  notifyReimbursementApproved,
  notifyReimbursementClaimantChanged,
  notifyReimbursementRaisedForYou,
  notifyReimbursementRejected,
  notifyReimbursementSubmitted,
} from "@pi-dash/notifications/send/reimbursement";

import type {
  NotifyReimbursementApprovedPayload,
  NotifyReimbursementClaimantChangedPayload,
  NotifyReimbursementRaisedForYouPayload,
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

export const handleNotifyReimbursementRaisedForYou =
  createNotifyHandler<NotifyReimbursementRaisedForYouPayload>(
    "notify-reimbursement-raised-for-you",
    async () => notifyReimbursementRaisedForYou
  );

export const handleNotifyReimbursementClaimantChanged =
  createNotifyHandler<NotifyReimbursementClaimantChangedPayload>(
    "notify-reimbursement-claimant-changed",
    async () => notifyReimbursementClaimantChanged
  );
