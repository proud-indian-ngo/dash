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

export const handleNotifyVpFullyPaid =
  createNotifyHandler<NotifyVpFullyPaidPayload>(
    "notify-vp-fully-paid",
    async () => (await import("@pi-dash/notifications")).notifyVpFullyPaid
  );

export const handleNotifyVptCascadeRejected =
  createNotifyHandler<NotifyVptCascadeRejectedPayload>(
    "notify-vpt-cascade-rejected",
    async () =>
      (await import("@pi-dash/notifications")).notifyVptCascadeRejected
  );
