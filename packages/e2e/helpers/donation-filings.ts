import { db } from "@pi-dash/db";
import { revealSecret } from "@pi-dash/db/encryption";
import { filingRowIdContext } from "@pi-dash/db/encryption-contexts";
import {
  donationCertificate,
  donationFiling,
  donationFilingRow,
} from "@pi-dash/db/schema/private/donation-filings";
import { asc, desc, eq, sql } from "drizzle-orm";
import { zipSync } from "fflate";

import { syntheticCertificatePdf } from "../../../apps/web/src/lib/donation-filings/synthetic-certificate.test-helper";
import { removeDonationFilings } from "./donation-filings-reset";

/**
 * Database steps for the donation filings spec, run with Bun as a script
 * because Playwright's Node runner cannot load `@pi-dash/db`. Prints one
 * JSON value. Synthetic certificates only.
 *
 * - `reset`: removes every filing (see donation-filings-reset.ts).
 * - `latest <fy>`: the year's newest filing.
 * - `certificates <filingId>`: a ZIP of a synthetic Form 114 per row (the
 *   first without its Pre-ARN, so it matches by details and needs review)
 *   plus one that fits no row, as base64.
 * - `email-jobs <filingId>`: how many email jobs were queued for the
 *   filing's certificates (captured in pg-boss; E2E has no Resend key, so
 *   nothing is delivered).
 */

const [action, arg = ""] = process.argv.slice(2);

const rupees = (paise: number) =>
  new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(paise / 100);

let result: unknown;
if (action === "reset") {
  await removeDonationFilings();
  result = { reset: true };
} else if (action === "latest") {
  const [filing] = await db
    .select({ id: donationFiling.id, sequence: donationFiling.sequence })
    .from(donationFiling)
    .where(eq(donationFiling.fiscalYear, arg))
    .orderBy(desc(donationFiling.sequence))
    .limit(1);
  result = filing ?? null;
} else if (action === "certificates") {
  const rows = await db
    .select()
    .from(donationFilingRow)
    .where(eq(donationFilingRow.filingId, arg))
    .orderBy(asc(donationFilingRow.srNo));
  const files: Record<string, Uint8Array> = {};
  for (const [index, row] of rows.entries()) {
    files[`114/${row.srNo}.pdf`] = syntheticCertificatePdf({
      acknowledgementNumber: `E2E114${String(Date.now()).slice(-6)}${String(row.srNo).padStart(4, "0")}`,
      amount: rupees(row.amountPaise),
      donationType: row.donationTypeCode,
      donorName: row.name,
      idNumber: revealSecret(row.idNumberEncrypted, filingRowIdContext(row.id)),
      mode: row.modeCode,
      preArn: index === 0 ? undefined : (row.preArn ?? undefined),
    });
  }
  files["114/stray.pdf"] = syntheticCertificatePdf({
    acknowledgementNumber: "E2E114STRAY0001",
    amount: "1.00",
    donationType: "Corpus",
    donorName: "Nobody",
    idNumber: "ZZZZZ0000Z",
    mode: "Cash",
  });
  result = {
    base64: Buffer.from(zipSync(files)).toString("base64"),
    rowCount: rows.length,
  };
} else if (action === "email-jobs") {
  const certificates = await db
    .select({ id: donationCertificate.id })
    .from(donationCertificate)
    .where(eq(donationCertificate.filingId, arg));
  const ids = certificates.map((row) => row.id);
  const [jobs] =
    ids.length === 0
      ? [{ total: 0 }]
      : await db.execute<{ total: number }>(sql`
          SELECT count(*)::int AS total FROM pgboss.job
          WHERE name = 'send-donation-certificate'
            AND data->>'certificateId' IN (${sql.join(
              ids.map((id) => sql`${id}`),
              sql`, `
            )})
        `);
  result = { certificates: ids.length, jobs: jobs?.total ?? 0 };
} else {
  throw new Error(`Unknown action ${action}`);
}
process.stdout.write(`${JSON.stringify(result)}\n`);
process.exit(0);
