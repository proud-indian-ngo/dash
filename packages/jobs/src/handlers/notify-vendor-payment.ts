import {
  notifyVendorPaymentApproved,
  notifyVendorPaymentInvoiceApproved,
  notifyVendorPaymentInvoiceRejected,
  notifyVendorPaymentInvoiceSubmitted,
  notifyVendorPaymentRejected,
  notifyVendorPaymentSubmitted,
  notifyVpFullyPaid,
  notifyVptCascadeRejected,
} from "@pi-dash/notifications";
import type {
  NotifyVendorPaymentApprovedPayload,
  NotifyVendorPaymentRejectedPayload,
  NotifyVendorPaymentSubmittedPayload,
  NotifyVpFullyPaidPayload,
  NotifyVpInvoiceApprovedPayload,
  NotifyVpInvoiceRejectedPayload,
  NotifyVpInvoiceSubmittedPayload,
  NotifyVptCascadeRejectedPayload,
} from "../enqueue";
import { createNotifyHandler } from "./create-handler";

export const handleNotifyVendorPaymentSubmitted =
  createNotifyHandler<NotifyVendorPaymentSubmittedPayload>(
    "notify-vendor-payment-submitted",
    async () => notifyVendorPaymentSubmitted
  );

export const handleNotifyVendorPaymentApproved =
  createNotifyHandler<NotifyVendorPaymentApprovedPayload>(
    "notify-vendor-payment-approved",
    async () => notifyVendorPaymentApproved
  );

export const handleNotifyVendorPaymentRejected =
  createNotifyHandler<NotifyVendorPaymentRejectedPayload>(
    "notify-vendor-payment-rejected",
    async () => notifyVendorPaymentRejected
  );

export const handleNotifyVpInvoiceSubmitted =
  createNotifyHandler<NotifyVpInvoiceSubmittedPayload>(
    "notify-vp-invoice-submitted",
    async () => notifyVendorPaymentInvoiceSubmitted
  );

export const handleNotifyVpInvoiceApproved =
  createNotifyHandler<NotifyVpInvoiceApprovedPayload>(
    "notify-vp-invoice-approved",
    async () => notifyVendorPaymentInvoiceApproved
  );

export const handleNotifyVpInvoiceRejected =
  createNotifyHandler<NotifyVpInvoiceRejectedPayload>(
    "notify-vp-invoice-rejected",
    async () => notifyVendorPaymentInvoiceRejected
  );

export const handleNotifyVpFullyPaid =
  createNotifyHandler<NotifyVpFullyPaidPayload>(
    "notify-vp-fully-paid",
    async () => notifyVpFullyPaid
  );

export const handleNotifyVptCascadeRejected =
  createNotifyHandler<NotifyVptCascadeRejectedPayload>(
    "notify-vpt-cascade-rejected",
    async () => notifyVptCascadeRejected
  );
