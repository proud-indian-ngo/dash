import type {
  NotifyVendorPaymentApprovedPayload,
  NotifyVendorPaymentRejectedPayload,
  NotifyVendorPaymentSubmittedPayload,
  NotifyVpInvoiceApprovedPayload,
  NotifyVpInvoiceRejectedPayload,
  NotifyVpInvoiceSubmittedPayload,
} from "../enqueue";
import { createNotifyHandler } from "./create-handler";

export const handleNotifyVendorPaymentSubmitted =
  createNotifyHandler<NotifyVendorPaymentSubmittedPayload>(
    "notify-vendor-payment-submitted",
    async () =>
      (await import("@pi-dash/notifications")).notifyVendorPaymentSubmitted
  );

export const handleNotifyVendorPaymentApproved =
  createNotifyHandler<NotifyVendorPaymentApprovedPayload>(
    "notify-vendor-payment-approved",
    async () =>
      (await import("@pi-dash/notifications")).notifyVendorPaymentApproved
  );

export const handleNotifyVendorPaymentRejected =
  createNotifyHandler<NotifyVendorPaymentRejectedPayload>(
    "notify-vendor-payment-rejected",
    async () =>
      (await import("@pi-dash/notifications")).notifyVendorPaymentRejected
  );

export const handleNotifyVpInvoiceSubmitted =
  createNotifyHandler<NotifyVpInvoiceSubmittedPayload>(
    "notify-vp-invoice-submitted",
    async () =>
      (await import("@pi-dash/notifications"))
        .notifyVendorPaymentInvoiceSubmitted
  );

export const handleNotifyVpInvoiceApproved =
  createNotifyHandler<NotifyVpInvoiceApprovedPayload>(
    "notify-vp-invoice-approved",
    async () =>
      (await import("@pi-dash/notifications"))
        .notifyVendorPaymentInvoiceApproved
  );

export const handleNotifyVpInvoiceRejected =
  createNotifyHandler<NotifyVpInvoiceRejectedPayload>(
    "notify-vp-invoice-rejected",
    async () =>
      (await import("@pi-dash/notifications"))
        .notifyVendorPaymentInvoiceRejected
  );
