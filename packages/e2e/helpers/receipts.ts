import { db } from "@pi-dash/db";
import { contributionReceipt } from "@pi-dash/db/schema/contribution-receipt";
import { contribution } from "@pi-dash/db/schema/income";
import { partyPrivate } from "@pi-dash/db/schema/private/party-private";
import { contributionReceiptSnapshot } from "@pi-dash/db/schema/private/receipts";
import { receiptVerifyUrl } from "@pi-dash/jobs/lib/receipt-verification";
import { and, eq, isNull, sql } from "drizzle-orm";

/**
 * Database steps for the receipts spec, run with Bun as a script because
 * Playwright's Node runner cannot load `@pi-dash/db`. Prints one JSON value.
 *
 * - `clear-details-address`: removes the address of "E2E Receipt Details
 *   Donor" (seeded in seed-test-user.ts), so its gift reads Needs details
 *   again before each attempt of the test that adds the address.
 * - `inspect-automatic <reference>`: returns only the live receipt count and
 *   stored PDF count, and sanitized job names, states and outcomes.
 * - `verify-path <receiptId>`: the path and query of the signed verification link.
 */

/** RECEIPT_DETAILS_DONOR_ID in seed-test-user.ts. */
const RECEIPT_DETAILS_DONOR_ID = "01930000-0000-7000-8000-000000000746";

const [action, reference] = process.argv.slice(2);

if (action === "verify-path" && reference) {
  const url = new URL(receiptVerifyUrl(reference));
  process.stdout.write(
    `${JSON.stringify({ path: url.pathname + url.search })}\n`
  );
  process.exit(0);
}

if (action === "clear-details-address") {
  const cleared = await db
    .update(partyPrivate)
    .set({ addressLine1: null, pincode: null, updatedAt: new Date() })
    .where(eq(partyPrivate.partyId, RECEIPT_DETAILS_DONOR_ID))
    .returning({ partyId: partyPrivate.partyId });
  process.stdout.write(`${JSON.stringify({ cleared: cleared.length })}\n`);
  process.exit(0);
}

if (action === "inspect-automatic") {
  if (!reference) {
    throw new Error("inspect-automatic requires a contribution reference");
  }
  const [gift] = await db
    .select({ id: contribution.id })
    .from(contribution)
    .where(eq(contribution.reference, reference));
  if (!gift) {
    process.stdout.write(
      `${JSON.stringify({ jobs: [], receiptCount: 0, storedPdfCount: 0 })}\n`
    );
    process.exit(0);
  }

  const receipts = await db
    .select({
      id: contributionReceipt.id,
      pdfKey: contributionReceiptSnapshot.pdfKey,
      pdfSha256: contributionReceiptSnapshot.pdfSha256,
    })
    .from(contributionReceipt)
    .leftJoin(
      contributionReceiptSnapshot,
      eq(contributionReceiptSnapshot.receiptId, contributionReceipt.id)
    )
    .where(
      and(
        eq(contributionReceipt.contributionId, gift.id),
        isNull(contributionReceipt.voidedAt)
      )
    );
  const issueJobs = await db.execute<{
    name: string;
    outcome: string | null;
    state: string;
  }>(
    sql`select name, state, output->'result'->>'outcome' as outcome
        from pgboss.job
        where name = 'issue-contribution-receipt'
          and data->>'contributionId' = ${gift.id}`
  );
  const deliveryJobs = receipts[0]
    ? await db.execute<{
        name: string;
        outcome: string | null;
        state: string;
      }>(
        sql`select name, state, output->'result'->>'outcome' as outcome
            from pgboss.job
            where name in (
              'send-contribution-receipt',
              'send-contribution-receipt-whatsapp',
              'store-contribution-receipt-pdf'
            )
              and data->>'receiptId' = ${receipts[0].id}`
      )
    : [];
  const jobs = [...issueJobs, ...deliveryJobs]
    .map(({ name, outcome, state }) => ({ name, outcome, state }))
    .sort((a, b) => a.name.localeCompare(b.name));
  process.stdout.write(
    `${JSON.stringify({
      jobs,
      receiptCount: receipts.length,
      storedPdfCount: receipts.filter(
        (row) =>
          row.pdfKey && row.pdfSha256 && /^[0-9a-f]{64}$/.test(row.pdfSha256)
      ).length,
    })}\n`
  );
  process.exit(0);
}

throw new Error(`Unknown action ${action}`);
