/**
 * Correct vendor payment statuses that disagree with their payments and
 * invoice. Before payments needed an approved request, a request could be paid
 * while still `pending`, and an admin approval could drop a paid or invoiced
 * request back to `approved`.
 *
 * Usage:
 *   bun run vendor-payments:repair-status
 *   bun run vendor-payments:repair-status --apply --actor <email>
 *
 * Dry run by default. `--apply` updates each listed status and records an
 * `updated` history entry by the `--actor` user; that history entry is the
 * only trace, as scripts do not write `audit_log`. Pending requests that were
 * paid are only listed: approve them in the app, which moves them on to
 * partially paid or paid. Rows that need a person's judgement are listed for
 * review and never changed. Requests moved to paid are listed at the end so
 * finance can chase their invoices; no notifications are sent. Safe to run
 * again; corrected rows no longer match.
 */
import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import { rolePermission } from "@pi-dash/db/schema/permission";
import {
  type VendorPaymentStatus,
  vendorPayment,
  vendorPaymentHistory,
  vendorPaymentLineItem,
} from "@pi-dash/db/schema/vendor";
import { vendorPaymentTransaction } from "@pi-dash/db/schema/vendor-payment-transaction";
import {
  planVendorPaymentRepair,
  type VendorPaymentReviewReason,
} from "@pi-dash/zero/vendor-payment-status-repair";
import { and, eq, inArray, max } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

const USAGE = `Usage:
  bun run vendor-payments:repair-status
  bun run vendor-payments:repair-status --apply --actor <email>
`;

function fail(message: string): never {
  process.stderr.write(`${message}\n\n${USAGE}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const actorIndex = args.indexOf("--actor");
const actorEmail = actorIndex === -1 ? undefined : args[actorIndex + 1];
if (actorIndex !== -1 && (!actorEmail || actorEmail.startsWith("--"))) {
  fail(
    "--actor needs an email address, for example --actor finance@example.org"
  );
}

let actorId: string | undefined;
if (apply) {
  if (!actorEmail) {
    fail("--apply needs --actor <email> for the history entries");
  }
  const actor = await db
    .select({ id: user.id, role: user.role })
    .from(user)
    .where(eq(user.email, actorEmail))
    .limit(1);
  actorId = actor[0]?.id;
  if (!actorId) {
    fail(`No user with email ${actorEmail}`);
  }
  const actorRole = actor[0]?.role;
  const canEditAnyStatus = actorRole
    ? await db
        .select({ permissionId: rolePermission.permissionId })
        .from(rolePermission)
        .where(
          and(
            eq(rolePermission.roleId, actorRole),
            eq(rolePermission.permissionId, "requests.edit_all_statuses")
          )
        )
        .limit(1)
    : [];
  if (canEditAnyStatus.length === 0) {
    process.stderr.write(
      `Warning: ${actorEmail} lacks requests.edit_all_statuses; the history will show them changing statuses they could not change in the app.\n\n`
    );
  }
}

const payments = await db
  .select({
    id: vendorPayment.id,
    invoiceNumber: vendorPayment.invoiceNumber,
    invoiceRejectionReason: vendorPayment.invoiceRejectionReason,
    invoiceReviewedAt: vendorPayment.invoiceReviewedAt,
    status: vendorPayment.status,
    title: vendorPayment.title,
  })
  .from(vendorPayment)
  .where(
    inArray(vendorPayment.status, [
      "pending",
      "approved",
      "partially_paid",
      "paid",
      "rejected",
    ])
  );
const ids = payments.map((p) => p.id);

const amountsBy = (
  rows: { amountPaise: number; vendorPaymentId: string }[]
) => {
  const map = new Map<string, number[]>();
  for (const row of rows) {
    const list = map.get(row.vendorPaymentId) ?? [];
    list.push(row.amountPaise);
    map.set(row.vendorPaymentId, list);
  }
  return map;
};

const approvedAmounts = amountsBy(
  ids.length === 0
    ? []
    : await db
        .select({
          amountPaise: vendorPaymentTransaction.amountPaise,
          vendorPaymentId: vendorPaymentTransaction.vendorPaymentId,
        })
        .from(vendorPaymentTransaction)
        .where(
          and(
            inArray(vendorPaymentTransaction.vendorPaymentId, ids),
            eq(vendorPaymentTransaction.status, "approved")
          )
        )
);
const lineItemAmounts = amountsBy(
  ids.length === 0
    ? []
    : await db
        .select({
          amountPaise: vendorPaymentLineItem.amountPaise,
          vendorPaymentId: vendorPaymentLineItem.vendorPaymentId,
        })
        .from(vendorPaymentLineItem)
        .where(inArray(vendorPaymentLineItem.vendorPaymentId, ids))
);

// `updatedAt` moves with every payment and status change, so the invoice
// history entries are the only reliable date for the current invoice.
const latestInvoiceSubmissions =
  ids.length === 0
    ? []
    : await db
        .select({
          submittedAt: max(vendorPaymentHistory.createdAt),
          vendorPaymentId: vendorPaymentHistory.vendorPaymentId,
        })
        .from(vendorPaymentHistory)
        .where(
          and(
            inArray(vendorPaymentHistory.vendorPaymentId, ids),
            inArray(vendorPaymentHistory.action, [
              "invoice_submitted",
              "invoice_updated",
            ])
          )
        )
        .groupBy(vendorPaymentHistory.vendorPaymentId);
const latestInvoiceSubmittedAt = new Map(
  latestInvoiceSubmissions.map((row) => [row.vendorPaymentId, row.submittedAt])
);

const REVIEW_REASONS: Record<VendorPaymentReviewReason, string> = {
  invoice_not_fully_paid: "has an invoice but payments say",
  invoice_review_stale:
    "has an invoice changed after its last approval; payments say",
  rejected_with_payments:
    "was rejected but has approved payments; payments say",
};

const movedToPaid: string[] = [];
let fixed = 0;
let toApprove = 0;
let toReview = 0;
for (const payment of payments) {
  const plan = planVendorPaymentRepair({
    approvedTransactionAmountsPaise: approvedAmounts.get(payment.id) ?? [],
    invoiceNumber: payment.invoiceNumber,
    invoiceRejectionReason: payment.invoiceRejectionReason,
    invoiceReviewedAt: payment.invoiceReviewedAt,
    latestInvoiceSubmittedAt: latestInvoiceSubmittedAt.get(payment.id) ?? null,
    lineItemAmountsPaise: lineItemAmounts.get(payment.id) ?? [],
    status: payment.status,
  });
  const label = `${payment.id} "${payment.title}"`;

  if (plan.kind === "approve") {
    toApprove += 1;
    process.stdout.write(
      `APPROVE IN APP  ${label}: pending, payments say ${plan.paymentStatus}\n`
    );
    continue;
  }
  if (plan.kind === "review") {
    toReview += 1;
    process.stdout.write(
      `REVIEW          ${label}: ${payment.status}, ${REVIEW_REASONS[plan.reason]} ${plan.paymentStatus}\n`
    );
    continue;
  }
  if (plan.kind !== "fix") {
    continue;
  }

  fixed += 1;
  const nextStatus = plan.status as VendorPaymentStatus;
  process.stdout.write(
    `${apply ? "FIXED" : "WOULD FIX"}       ${label}: ${payment.status} → ${nextStatus}\n`
  );
  if (!(apply && actorId)) {
    if (nextStatus === "paid") {
      movedToPaid.push(label);
    }
    continue;
  }
  const now = new Date();
  const historyActorId = actorId;
  const changed = await db.transaction(async (tx) => {
    const updated = await tx
      .update(vendorPayment)
      .set({ status: nextStatus, updatedAt: now })
      .where(
        and(
          eq(vendorPayment.id, payment.id),
          eq(vendorPayment.status, payment.status)
        )
      )
      .returning({ id: vendorPayment.id });
    if (updated.length === 0) {
      return false;
    }
    await tx.insert(vendorPaymentHistory).values({
      action: "updated",
      actorId: historyActorId,
      createdAt: now,
      id: uuidv7(),
      metadata: { fromStatus: payment.status, toStatus: nextStatus },
      note: `Status corrected from ${payment.status} to ${nextStatus}`,
      vendorPaymentId: payment.id,
    });
    return true;
  });
  if (changed && nextStatus === "paid") {
    movedToPaid.push(label);
  }
}

process.stdout.write(
  `\nVendor payments checked: ${payments.length}. ${apply ? "Fixed" : "Would fix"}: ${fixed}. Approve in app: ${toApprove}. Review by hand: ${toReview}.\n`
);
if (movedToPaid.length > 0) {
  process.stdout.write(
    `\n${apply ? "Moved" : "Would move"} to paid; chase these invoices with their owners:\n`
  );
  for (const label of movedToPaid) {
    process.stdout.write(`  ${label}\n`);
  }
}
if (!apply && fixed > 0) {
  process.stdout.write("Dry run. Re-run with --apply --actor <email>.\n");
}
process.exit(0);
