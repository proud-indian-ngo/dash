import { createRequestLogger } from "evlog";
import type PgBoss from "pg-boss";
import type {
  NotifyVendorPaymentApprovedPayload,
  NotifyVendorPaymentRejectedPayload,
  NotifyVendorPaymentSubmittedPayload,
  NotifyVpInvoiceApprovedPayload,
  NotifyVpInvoiceRejectedPayload,
  NotifyVpInvoiceSubmittedPayload,
} from "../enqueue";

export async function handleNotifyVendorPaymentSubmitted(
  jobs: PgBoss.Job<NotifyVendorPaymentSubmittedPayload>[]
): Promise<void> {
  for (const job of jobs) {
    const log = createRequestLogger({
      method: "JOB",
      path: "notify-vendor-payment-submitted",
    });
    log.set({ jobId: job.id, ...job.data });
    const { notifyVendorPaymentSubmitted } = await import(
      "@pi-dash/notifications"
    );
    await notifyVendorPaymentSubmitted(job.data);
    log.set({ event: "job_complete" });
    log.emit();
  }
}

export async function handleNotifyVendorPaymentApproved(
  jobs: PgBoss.Job<NotifyVendorPaymentApprovedPayload>[]
): Promise<void> {
  for (const job of jobs) {
    const log = createRequestLogger({
      method: "JOB",
      path: "notify-vendor-payment-approved",
    });
    log.set({ jobId: job.id, ...job.data });
    const { notifyVendorPaymentApproved } = await import(
      "@pi-dash/notifications"
    );
    await notifyVendorPaymentApproved(job.data);
    log.set({ event: "job_complete" });
    log.emit();
  }
}

export async function handleNotifyVendorPaymentRejected(
  jobs: PgBoss.Job<NotifyVendorPaymentRejectedPayload>[]
): Promise<void> {
  for (const job of jobs) {
    const log = createRequestLogger({
      method: "JOB",
      path: "notify-vendor-payment-rejected",
    });
    log.set({ jobId: job.id, ...job.data });
    const { notifyVendorPaymentRejected } = await import(
      "@pi-dash/notifications"
    );
    await notifyVendorPaymentRejected(job.data);
    log.set({ event: "job_complete" });
    log.emit();
  }
}

export async function handleNotifyVpInvoiceSubmitted(
  jobs: PgBoss.Job<NotifyVpInvoiceSubmittedPayload>[]
): Promise<void> {
  for (const job of jobs) {
    const log = createRequestLogger({
      method: "JOB",
      path: "notify-vp-invoice-submitted",
    });
    log.set({ jobId: job.id, ...job.data });
    const { notifyVendorPaymentInvoiceSubmitted } = await import(
      "@pi-dash/notifications"
    );
    await notifyVendorPaymentInvoiceSubmitted(job.data);
    log.set({ event: "job_complete" });
    log.emit();
  }
}

export async function handleNotifyVpInvoiceApproved(
  jobs: PgBoss.Job<NotifyVpInvoiceApprovedPayload>[]
): Promise<void> {
  for (const job of jobs) {
    const log = createRequestLogger({
      method: "JOB",
      path: "notify-vp-invoice-approved",
    });
    log.set({ jobId: job.id, ...job.data });
    const { notifyVendorPaymentInvoiceApproved } = await import(
      "@pi-dash/notifications"
    );
    await notifyVendorPaymentInvoiceApproved(job.data);
    log.set({ event: "job_complete" });
    log.emit();
  }
}

export async function handleNotifyVpInvoiceRejected(
  jobs: PgBoss.Job<NotifyVpInvoiceRejectedPayload>[]
): Promise<void> {
  for (const job of jobs) {
    const log = createRequestLogger({
      method: "JOB",
      path: "notify-vp-invoice-rejected",
    });
    log.set({ jobId: job.id, ...job.data });
    const { notifyVendorPaymentInvoiceRejected } = await import(
      "@pi-dash/notifications"
    );
    await notifyVendorPaymentInvoiceRejected(job.data);
    log.set({ event: "job_complete" });
    log.emit();
  }
}
