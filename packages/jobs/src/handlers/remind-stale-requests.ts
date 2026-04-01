import { db } from "@pi-dash/db";
import { advancePayment } from "@pi-dash/db/schema/advance-payment";
import { reimbursement } from "@pi-dash/db/schema/reimbursement";
import { vendorPayment } from "@pi-dash/db/schema/vendor";
import {
  getUserIdsWithPermission,
  notifyStaleRequests,
} from "@pi-dash/notifications";
import { count, sql } from "drizzle-orm";
import { createRequestLogger } from "evlog";
import type { Job } from "pg-boss";
import type { RemindStaleRequestsPayload } from "../enqueue";

const STALE_THRESHOLD_DAYS = 3;

export async function handleRemindStaleRequests(
  _jobs: Job<RemindStaleRequestsPayload>[]
): Promise<void> {
  const log = createRequestLogger({
    method: "JOB",
    path: "remind-stale-requests",
  });

  const threshold = new Date(
    Date.now() - STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000
  );

  const [reimbursementCount, advancePaymentCount, vendorPaymentCount] =
    await Promise.all([
      db
        .select({ value: count() })
        .from(reimbursement)
        .where(
          sql`${reimbursement.status} = 'pending' AND ${reimbursement.submittedAt} < ${threshold}`
        )
        .then((r) => r[0]?.value ?? 0),
      db
        .select({ value: count() })
        .from(advancePayment)
        .where(
          sql`${advancePayment.status} = 'pending' AND ${advancePayment.submittedAt} < ${threshold}`
        )
        .then((r) => r[0]?.value ?? 0),
      db
        .select({ value: count() })
        .from(vendorPayment)
        .where(
          sql`${vendorPayment.status} = 'pending' AND ${vendorPayment.submittedAt} < ${threshold}`
        )
        .then((r) => r[0]?.value ?? 0),
    ]);

  const total = reimbursementCount + advancePaymentCount + vendorPaymentCount;
  log.set({
    reimbursementCount,
    advancePaymentCount,
    vendorPaymentCount,
    total,
  });

  if (total === 0) {
    log.set({ event: "no_stale_requests" });
    log.emit();
    return;
  }

  const approverIds = await getUserIdsWithPermission("requests.approve");

  const results = await Promise.allSettled(
    approverIds.map((userId) =>
      notifyStaleRequests({
        userId,
        counts: {
          reimbursements: reimbursementCount,
          advancePayments: advancePaymentCount,
          vendorPayments: vendorPaymentCount,
        },
      })
    )
  );

  const failures = results.filter((r) => r.status === "rejected");
  log.set({
    event: "job_complete",
    notified: approverIds.length,
    failures: failures.length,
  });
  log.emit();

  if (failures.length > 0) {
    throw new Error(
      `${failures.length}/${approverIds.length} reminder(s) failed`
    );
  }
}
