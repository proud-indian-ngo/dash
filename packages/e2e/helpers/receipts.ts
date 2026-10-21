import { db } from "@pi-dash/db";
import { contributionReceipt } from "@pi-dash/db/schema/contribution-receipt";
import { contribution } from "@pi-dash/db/schema/income";
import { partyPrivate } from "@pi-dash/db/schema/private/party-private";
import { and, eq, isNull, sql } from "drizzle-orm";

/**
 * Database steps for the receipts spec, run with Bun as a script because
 * Playwright's Node runner cannot load `@pi-dash/db`. Prints one JSON value.
 *
 * - `clear-details-address`: removes the address of "E2E Receipt Details
 *   Donor" (seeded in seed-test-user.ts), so its gift reads Needs details
 *   again before each attempt of the test that adds the address.
 * - `inspect-automatic <reference>`: returns only the live receipt count and
 *   sanitized job names, states and outcomes for that contribution.
 */

/** RECEIPT_DETAILS_DONOR_ID in seed-test-user.ts. */
const RECEIPT_DETAILS_DONOR_ID = "01930000-0000-7000-8000-000000000746";

const [action, reference] = process.argv.slice(2);

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
    process.stdout.write(`${JSON.stringify({ jobs: [], receiptCount: 0 })}\n`);
    process.exit(0);
  }

  const receipts = await db
    .select({ id: contributionReceipt.id })
    .from(contributionReceipt)
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
              'send-contribution-receipt-whatsapp'
            )
              and data->>'receiptId' = ${receipts[0].id}`
      )
    : [];
  const jobs = [...issueJobs, ...deliveryJobs]
    .map(({ name, outcome, state }) => ({ name, outcome, state }))
    .sort((a, b) => a.name.localeCompare(b.name));
  process.stdout.write(
    `${JSON.stringify({ jobs, receiptCount: receipts.length })}\n`
  );
  process.exit(0);
}

throw new Error(`Unknown action ${action}`);
