import { db } from "@pi-dash/db";
import { advancePayment } from "@pi-dash/db/schema/advance-payment";
import { programme } from "@pi-dash/db/schema/finance-dimensions";
import { reimbursement } from "@pi-dash/db/schema/reimbursement";
import { teamEvent } from "@pi-dash/db/schema/team-event";
import { vendorPayment } from "@pi-dash/db/schema/vendor";
import { getUserIdsWithPermission } from "@pi-dash/notifications/helpers";
import { notifyStaleRequests } from "@pi-dash/notifications/send/reminders";
import { leadApproverOf } from "@pi-dash/shared/approval-policy";
import type { ExpenseChargedTo } from "@pi-dash/shared/constants";
import { and, count, eq, lt } from "drizzle-orm";
import { createRequestLogger } from "evlog";
import type { Job } from "pg-boss";

import type { RemindStaleRequestsPayload } from "../enqueue";

const STALE_THRESHOLD_DAYS = 3;

type Counts = Parameters<typeof notifyStaleRequests>[0]["counts"];

const emptyCounts = (): Counts => ({
  advancePayments: 0,
  reimbursements: 0,
  vendorPayments: 0,
});

interface StaleRow {
  chargedProgrammeId: null | string;
  chargedTo: ExpenseChargedTo;
  createdBy?: null | string;
  eventProgrammeId: null | string;
  leadApprovedAt: Date | null;
  userId: string;
}

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

  const [reimbursements, vendorPayments, advancePaymentCount, programmes] =
    await Promise.all([
      db
        .select({
          chargedProgrammeId: reimbursement.chargedProgrammeId,
          chargedTo: reimbursement.chargedTo,
          createdBy: reimbursement.createdBy,
          eventProgrammeId: teamEvent.programmeId,
          leadApprovedAt: reimbursement.leadApprovedAt,
          userId: reimbursement.userId,
        })
        .from(reimbursement)
        .leftJoin(teamEvent, eq(teamEvent.id, reimbursement.eventId))
        .where(
          and(
            eq(reimbursement.status, "pending"),
            lt(reimbursement.submittedAt, threshold)
          )
        ),
      db
        .select({
          chargedProgrammeId: vendorPayment.chargedProgrammeId,
          chargedTo: vendorPayment.chargedTo,
          eventProgrammeId: teamEvent.programmeId,
          leadApprovedAt: vendorPayment.leadApprovedAt,
          userId: vendorPayment.userId,
        })
        .from(vendorPayment)
        .leftJoin(teamEvent, eq(teamEvent.id, vendorPayment.eventId))
        .where(
          and(
            eq(vendorPayment.status, "pending"),
            lt(vendorPayment.submittedAt, threshold)
          )
        ),
      db
        .select({ value: count() })
        .from(advancePayment)
        .where(
          and(
            eq(advancePayment.status, "pending"),
            lt(advancePayment.submittedAt, threshold)
          )
        )
        .then((r) => r[0]?.value ?? 0),
      db
        .select({ id: programme.id, leadUserId: programme.leadUserId })
        .from(programme),
    ]);

  // A request waits for its programme lead while the lead step is
  // outstanding ("Approval policy"), else for finance.
  const leads = new Map(programmes.map((p) => [p.id, p.leadUserId]));
  const waitingLead = ({
    eventProgrammeId,
    leadApprovedAt,
    ...row
  }: StaleRow) =>
    leadApprovedAt
      ? null
      : leadApproverOf(
          { ...row, event: { programmeId: eventProgrammeId } },
          (programmeId) => leads.get(programmeId)
        );
  const finance = emptyCounts();
  finance.advancePayments = advancePaymentCount;
  const byLead = new Map<string, Counts>();
  const tally = (rows: readonly StaleRow[], kind: keyof Counts) => {
    for (const row of rows) {
      const lead = waitingLead(row);
      let counts = finance;
      if (lead) {
        counts = byLead.get(lead) ?? emptyCounts();
        byLead.set(lead, counts);
      }
      counts[kind] += 1;
    }
  };
  tally(reimbursements, "reimbursements");
  tally(vendorPayments, "vendorPayments");

  const financeTotal =
    finance.reimbursements + finance.advancePayments + finance.vendorPayments;
  log.set({
    advancePaymentCount,
    leadCount: byLead.size,
    reimbursementCount: reimbursements.length,
    vendorPaymentCount: vendorPayments.length,
  });

  if (financeTotal === 0 && byLead.size === 0) {
    log.set({ event: "no_stale_requests" });
    log.emit();
    return;
  }

  // Each person hears of what waits for them; someone who is both a lead
  // and in finance gets one reminder with both.
  const recipients = new Map<string, Counts>();
  if (financeTotal > 0) {
    for (const userId of await getUserIdsWithPermission("requests.approve")) {
      recipients.set(userId, { ...finance });
    }
  }
  for (const [userId, counts] of byLead) {
    const current = recipients.get(userId) ?? emptyCounts();
    recipients.set(userId, {
      advancePayments: current.advancePayments + counts.advancePayments,
      reimbursements: current.reimbursements + counts.reimbursements,
      vendorPayments: current.vendorPayments + counts.vendorPayments,
    });
  }

  const results = await Promise.allSettled(
    [...recipients].map(([userId, counts]) =>
      notifyStaleRequests({ counts, userId })
    )
  );

  const failures = results.filter((r) => r.status === "rejected");
  log.set({
    event: "job_complete",
    failures: failures.length,
    notified: recipients.size,
  });
  log.emit();

  if (failures.length > 0) {
    throw new Error(`${failures.length}/${recipients.size} reminder(s) failed`);
  }
}
