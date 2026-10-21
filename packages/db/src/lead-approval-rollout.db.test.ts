import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PROGRAMME_IDS } from "@pi-dash/shared/constants";
import { SQL, type TransactionSQL } from "bun";
import { expect, it } from "vitest";

/**
 * The lead approval rollout in migration 0178: requests pending at
 * migration time that the lead step would now hold get the system skip
 * reason, so they keep going straight to finance. Opt in with
 * LEAD_APPROVAL_TEST_DATABASE_URL pointing at a local database (a
 * worktree's isolated one). Temporary tables shadow the real ones and the
 * transaction is rolled back.
 */

const databaseUrl = process.env.LEAD_APPROVAL_TEST_DATABASE_URL;
const localDatabase =
  databaseUrl !== undefined &&
  /^postgres(?:ql)?:\/\/[^/]*@(localhost|127\.0\.0\.1|\[::1\]):\d+\//.test(
    databaseUrl
  );

class Rollback extends Error {}

const rolloutStatements = readFileSync(
  join(import.meta.dirname, "migrations/0178_lead_approval.sql"),
  "utf8"
)
  .split("--> statement-breakpoint")
  .map((statement) => statement.trim())
  .filter((statement) =>
    statement
      .replaceAll(/^--.*$/gm, "")
      .trim()
      .startsWith("UPDATE ")
  );

it.skipIf(!localDatabase)(
  "marks only pending requests the lead step would hold",
  async () => {
    const client = new SQL(databaseUrl as string, { max: 1 });
    try {
      await client.begin(async (sql: TransactionSQL) => {
        await sql.unsafe(
          `CREATE TEMP TABLE programme (id uuid PRIMARY KEY, lead_user_id text) ON COMMIT DROP;
           CREATE TEMP TABLE team_event (id uuid PRIMARY KEY, programme_id uuid) ON COMMIT DROP;
           CREATE TEMP TABLE reimbursement (id text PRIMARY KEY, status text, charged_to text, charged_programme_id uuid, event_id uuid, user_id text, created_by text, lead_skip_reason text) ON COMMIT DROP;
           CREATE TEMP TABLE vendor_payment (id text PRIMARY KEY, status text, charged_to text, charged_programme_id uuid, event_id uuid, user_id text, lead_skip_reason text) ON COMMIT DROP;
           INSERT INTO programme VALUES
             ('01930000-0000-7000-8000-0000000000a1', 'lead'),
             ('01930000-0000-7000-8000-0000000000a2', NULL),
             ('${PROGRAMME_IDS.unallocated}', 'lead');
           INSERT INTO team_event VALUES
             ('01930000-0000-7000-8000-0000000000e1', '01930000-0000-7000-8000-0000000000a1');
           INSERT INTO reimbursement VALUES
             ('led', 'pending', 'programme', '01930000-0000-7000-8000-0000000000a1', NULL, 'c', 'c', NULL),
             ('via-event', 'pending', 'event', NULL, '01930000-0000-7000-8000-0000000000e1', 'c', 'c', NULL),
             ('approved', 'approved', 'programme', '01930000-0000-7000-8000-0000000000a1', NULL, 'c', 'c', NULL),
             ('no-lead', 'pending', 'programme', '01930000-0000-7000-8000-0000000000a2', NULL, 'c', 'c', NULL),
             ('unallocated', 'pending', 'programme', '${PROGRAMME_IDS.unallocated}', NULL, 'c', 'c', NULL),
             ('lead-claims', 'pending', 'programme', '01930000-0000-7000-8000-0000000000a1', NULL, 'lead', 'lead', NULL),
             ('admin', 'pending', 'organisation', NULL, NULL, 'c', 'c', NULL);
           INSERT INTO vendor_payment VALUES
             ('vp-led', 'pending', 'programme', '01930000-0000-7000-8000-0000000000a1', NULL, 'c', NULL),
             ('vp-paid', 'paid', 'programme', '01930000-0000-7000-8000-0000000000a1', NULL, 'c', NULL),
             ('vp-lead-own', 'pending', 'programme', '01930000-0000-7000-8000-0000000000a1', NULL, 'lead', NULL);`
        );
        for (const statement of rolloutStatements) {
          await sql.unsafe(statement);
        }
        const marked = async (table: string) =>
          (
            (await sql.unsafe(
              `SELECT id FROM ${table} WHERE lead_skip_reason = 'Submitted before lead approval began' ORDER BY id`
            )) as { id: string }[]
          ).map((row) => row.id);
        expect(await marked("reimbursement")).toEqual(["led", "via-event"]);
        expect(await marked("vendor_payment")).toEqual(["vp-led"]);
        throw new Rollback();
      });
    } catch (error) {
      if (!(error instanceof Rollback)) {
        throw error;
      }
    } finally {
      await client.close();
    }
  }
);

const purposeStatements = readFileSync(
  join(
    import.meta.dirname,
    "migrations/0179_reimbursement_attachment_purpose.sql"
  ),
  "utf8"
)
  .split("--> statement-breakpoint")
  .map((statement) => statement.trim())
  .filter((statement) =>
    statement
      .replaceAll(/^--.*$/gm, "")
      .trim()
      .startsWith("UPDATE ")
  );

it.skipIf(!localDatabase)(
  "classifies files so a lead only ever reaches receipts, legacy signed copies included",
  async () => {
    const client = new SQL(databaseUrl as string, { max: 1 });
    try {
      await client.begin(async (sql: TransactionSQL) => {
        await sql.unsafe(
          `CREATE TEMP TABLE reimbursement_attachment (id uuid PRIMARY KEY, reimbursement_id text, object_key text, created_at timestamp, purpose text DEFAULT 'receipt') ON COMMIT DROP;
           CREATE TEMP TABLE reimbursement_line_item (id text PRIMARY KEY, voucher_attachment_id uuid, signed_voucher_attachment_id uuid, payee_signature_attachment_id uuid) ON COMMIT DROP;
           CREATE TEMP TABLE reimbursement_history (id text PRIMARY KEY, reimbursement_id text, note text, metadata jsonb, created_at timestamp) ON COMMIT DROP;
           INSERT INTO reimbursement_attachment VALUES
             ('00000000-0000-7000-8000-000000000001', 'r1', 'app/attachments/reimbursements/r1/receipt.jpg', '2026-05-01', 'receipt'),
             ('00000000-0000-7000-8000-000000000002', 'r1', 'app/approval-screenshots/reimbursements/r1/approval-screenshots/p.png', '2026-05-02', 'receipt'),
             ('00000000-0000-7000-8000-000000000003', 'r1', 'app/vouchers/r1/v.pdf', '2026-05-02', 'receipt'),
             ('00000000-0000-7000-8000-000000000004', 'r1', 'app/attachments/reimbursements/r1/signature.png', '2026-05-01', 'receipt'),
             ('00000000-0000-7000-8000-000000000005', 'r1', 'app/attachments/reimbursements/r1/old-signed.jpg', '2026-05-03', 'receipt'),
             ('00000000-0000-7000-8000-000000000006', 'r1', 'app/attachments/reimbursements/r1/linked-signed.jpg', '2026-05-04', 'receipt'),
             ('00000000-0000-7000-8000-000000000007', 'r2', 'app/attachments/reimbursements/r2/receipt.jpg', '2026-06-01', 'receipt');
           INSERT INTO reimbursement_line_item VALUES
             ('li1', '00000000-0000-7000-8000-000000000003', '00000000-0000-7000-8000-000000000006', NULL);
           INSERT INTO reimbursement_history VALUES
             ('h1', 'r1', 'Payee signature collected from Ravi', '{"attachmentId":"00000000-0000-7000-8000-000000000004"}', '2026-05-01'),
             ('h2', 'r1', 'Signed voucher uploaded', NULL, '2026-05-03');`
        );
        for (const statement of purposeStatements) {
          await sql.unsafe(statement);
        }
        const rows = (await sql.unsafe(
          "SELECT right(id::text, 1) AS n, purpose FROM reimbursement_attachment ORDER BY id"
        )) as { n: string; purpose: string }[];
        expect(
          Object.fromEntries(rows.map((row) => [row.n, row.purpose]))
        ).toEqual({
          "1": "receipt",
          "2": "payment_proof",
          "3": "voucher",
          "4": "payee_signature",
          // Replaced long ago: no link, no ID in history, still refused.
          "5": "signed_voucher",
          "6": "signed_voucher",
          "7": "receipt",
        });
        throw new Rollback();
      });
    } catch (error) {
      if (!(error instanceof Rollback)) {
        throw error;
      }
    } finally {
      await client.close();
    }
  }
);
