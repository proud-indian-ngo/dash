import { createHash } from "node:crypto";

import { db } from "@pi-dash/db";
import { encryptSecret } from "@pi-dash/db/encryption";
import { filingRowIdContext } from "@pi-dash/db/encryption-contexts";
import { postIncomeSourceNow } from "@pi-dash/db/ledger/income-runner";
import { auditLog } from "@pi-dash/db/schema/audit-log";
import { user } from "@pi-dash/db/schema/auth";
import { contributionReceipt } from "@pi-dash/db/schema/contribution-receipt";
import { expenseCategory } from "@pi-dash/db/schema/expense-category";
import { fiscalYear, orgAccount } from "@pi-dash/db/schema/finance-dimensions";
import { utilisationCertificate } from "@pi-dash/db/schema/grant";
import { contribution } from "@pi-dash/db/schema/income";
import { party } from "@pi-dash/db/schema/party";
import {
  donationCertificate,
  donationFiling,
  donationFilingGift,
  donationFilingRow,
} from "@pi-dash/db/schema/private/donation-filings";
import { contributionReceiptSnapshot } from "@pi-dash/db/schema/private/receipts";
import {
  reimbursement,
  reimbursementAttachment,
  reimbursementLineItem,
} from "@pi-dash/db/schema/reimbursement";
import {
  vendor,
  vendorPayment,
  vendorPaymentAttachment,
  vendorPaymentLineItem,
} from "@pi-dash/db/schema/vendor";
import {
  vendorPaymentTransaction,
  vendorPaymentTransactionAttachment,
} from "@pi-dash/db/schema/vendor-payment-transaction";
import { GOVERNANCE_SEED_IDS } from "@pi-dash/db/seed-governance";
import { getR2Client } from "@pi-dash/jobs/handlers/r2";
import { COST_CENTRE_IDS } from "@pi-dash/shared/constants";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

/**
 * Database steps for the audit pack spec, run with Bun as a script because
 * Playwright's Node runner cannot load `@pi-dash/db`. Prints one JSON value.
 *
 * - `seed <run> <grantId>`: one posted record of each document type the
 *   pack covers in FY 2026-27, each file stored in the fake R2 with
 *   synthetic bytes: a reimbursement (a bill named in Hindi, a cash
 *   voucher, its signed copy, the payment screenshot and one bill whose
 *   object is never stored), a completed vendor payment with its invoice
 *   and a payment with its proof, a UPI gift with a live and a voided
 *   receipt, a submitted Form 113 filing with one Form 114 certificate, and
 *   a utilisation certificate of the grant with its long-term copy and the
 *   CA's certificate. Prints the year's ID, the workbook reference of each
 *   record and each stored file's SHA-256 by its index label.
 * - `audit <since ISO>`: the audit pack downloads since then, newest first.
 * - `cleanup <filingId>`: removes the seeded filing, so the filings spec
 *   (which starts from none) and the donations return see no trace of it.
 */

const YEAR = "2026-27";
/** "E2E Income Donor", seeded by seed-test-user. */
const INCOME_DONOR_ID = "01930000-0000-7000-8000-000000000721";
/** Must match GENERAL_FUND_ID and PROGRAMME_IDS.education in @pi-dash/shared/constants. */
const GENERAL_FUND_ID = "01930000-0000-7000-8000-000000000201";
const EDUCATION_ID = "01930000-0000-7000-8000-000000000001";

const r2 = getR2Client();
const sha256 = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

/**
 * Stores synthetic bytes under `key` and returns their SHA-256. The bytes
 * name only what the file is, so hashes repeat from run to run.
 */
async function store(key: string, text: string): Promise<string> {
  const bytes = new TextEncoder().encode(`%PDF-1.4\n% ${text}\n%%EOF\n`);
  await r2.write(key, bytes);
  return sha256(bytes);
}

async function userIdOf(email: string | undefined) {
  if (!email) {
    throw new Error("The test user's email is not set");
  }
  const [row] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email));
  if (!row) {
    throw new Error(`Test user ${email} not found`);
  }
  return row.id;
}

/**
 * A bank account for this run, made the main one: claims and vendor
 * payments are paid out of the main account (as the books expense fixture does).
 */
async function runBank(run: string, now: Date) {
  const id = uuidv7();
  await db.transaction(async (tx) => {
    await tx
      .update(orgAccount)
      .set({ isMain: false, updatedAt: now })
      .where(eq(orgAccount.isMain, true));
    await tx.insert(orgAccount).values({
      createdAt: now,
      id,
      isMain: true,
      kind: "bank",
      name: `E2E Audit Pack Bank ${run}`,
      updatedAt: now,
    });
  });
  return id;
}

async function seed(run: string, grantId: string) {
  const now = new Date();
  const code = run.replace(/[^A-Za-z0-9]/g, "").slice(-10);
  const userId = await userIdOf(process.env.VOLUNTEER_EMAIL);
  const [year] = await db
    .select({ id: fiscalYear.id })
    .from(fiscalYear)
    .where(eq(fiscalYear.label, YEAR));
  if (!year) {
    throw new Error(`FY ${YEAR} is not set up`);
  }
  const bankId = await runBank(run, now);
  const hashes: Record<string, string> = {};

  // A reimbursement paid on 20 June 2026.
  const categoryId = uuidv7();
  await db.insert(expenseCategory).values({
    createdAt: now,
    id: categoryId,
    name: `E2E Audit Pack Category ${run}`,
    updatedAt: now,
  });
  const claimId = uuidv7();
  const screenshotKey = `attachments/approval-screenshots/reimbursements/${claimId}/proof.png`;
  hashes["Payment proof"] = await store(screenshotKey, `screenshot`);
  await db.insert(reimbursement).values({
    approvalScreenshotKey: screenshotKey,
    chargedProgrammeId: EDUCATION_ID,
    chargedTo: "programme",
    createdAt: now,
    expenseDate: "2026-06-18",
    id: claimId,
    reviewedAt: new Date("2026-06-20T05:00:00Z"),
    reviewedBy: userId,
    status: "approved",
    title: `E2E audit pack claim ${run}`,
    updatedAt: now,
    userId,
  });
  await db.insert(reimbursementLineItem).values({
    amountPaise: 45_000,
    categoryId,
    createdAt: now,
    description: "Venue hire",
    id: uuidv7(),
    reimbursementId: claimId,
    sortOrder: 0,
    updatedAt: now,
  });
  const claimFiles = [
    { label: "Bill 1", name: "बिल-१.pdf", purpose: "receipt", stored: true },
    {
      label: "Bill 2",
      name: "missing-bill.pdf",
      purpose: "receipt",
      stored: false,
    },
    { label: "Cash voucher", name: null, purpose: "voucher", stored: true },
    {
      label: "Signed cash voucher",
      name: "signed.pdf",
      purpose: "signed_voucher",
      stored: true,
    },
  ] as const;
  for (const [index, file] of claimFiles.entries()) {
    const id = uuidv7();
    const key = `attachments/reimbursements/${claimId}/${id}.pdf`;
    if (file.stored) {
      hashes[file.label] = await store(key, file.label);
    }
    await db.insert(reimbursementAttachment).values({
      createdAt: new Date(now.getTime() + index),
      filename: file.name,
      id,
      mimeType: "application/pdf",
      objectKey: key,
      purpose: file.purpose,
      reimbursementId: claimId,
      type: "file",
    });
  }
  await postIncomeSourceNow({ sourceId: claimId, sourceType: "reimbursement" });

  // A vendor payment, its invoice accepted, paid on 10 July 2026.
  const vendorId = uuidv7();
  await db.insert(party).values({
    createdAt: now,
    displayName: `E2E Audit Pack Vendor ${run}`,
    id: vendorId,
    kind: "organisation",
    updatedAt: now,
  });
  await db.insert(vendor).values({
    createdAt: now,
    id: vendorId,
    name: `E2E Audit Pack Vendor ${run}`,
    status: "approved",
    updatedAt: now,
  });
  const vendorPaymentId = uuidv7();
  await db.insert(vendorPayment).values({
    chargedTo: "organisation",
    costCentreId: COST_CENTRE_IDS.bangalore,
    createdAt: now,
    id: vendorPaymentId,
    invoiceDate: "2026-07-12",
    invoiceNumber: `INV-AP-${code}`,
    invoiceReviewedAt: new Date("2026-07-12T05:00:00Z"),
    reviewedAt: now,
    reviewedBy: userId,
    status: "completed",
    title: `E2E audit pack vendor payment ${run}`,
    updatedAt: now,
    userId,
    vendorId,
  });
  await db.insert(vendorPaymentLineItem).values({
    amountPaise: 250_000,
    categoryId,
    createdAt: now,
    id: uuidv7(),
    sortOrder: 0,
    updatedAt: now,
    vendorPaymentId,
  });
  const invoiceKey = `attachments/vendor-payments/${vendorPaymentId}/invoice.pdf`;
  hashes.Invoice = await store(invoiceKey, `invoice`);
  await db.insert(vendorPaymentAttachment).values({
    createdAt: now,
    filename: "invoice.pdf",
    id: uuidv7(),
    mimeType: "application/pdf",
    objectKey: invoiceKey,
    purpose: "invoice",
    type: "file",
    vendorPaymentId,
  });
  const paymentId = uuidv7();
  await db.insert(vendorPaymentTransaction).values({
    amountPaise: 250_000,
    createdAt: now,
    id: paymentId,
    paymentMethod: "bank_transfer",
    paymentReference: `E2EAPUTR${code}`,
    reviewedAt: now,
    reviewedBy: userId,
    status: "approved",
    transactionDate: new Date("2026-07-10T05:00:00Z"),
    updatedAt: now,
    userId,
    vendorPaymentId,
  });
  const proofKey = `attachments/vendor-payment-transactions/${paymentId}/utr.pdf`;
  hashes["Payment proof (vendor)"] = await store(proofKey, `utr`);
  await db.insert(vendorPaymentTransactionAttachment).values({
    createdAt: now,
    filename: "utr.pdf",
    id: uuidv7(),
    mimeType: "application/pdf",
    objectKey: proofKey,
    type: "file",
    vendorPaymentTransactionId: paymentId,
  });
  await postIncomeSourceNow({
    sourceId: vendorPaymentId,
    sourceType: "vendor_payment",
  });

  // A UPI gift with a voided receipt and the live one that replaced it.
  // Out of the real series (its own year label), like the certificate fixtures.
  const giftId = uuidv7();
  await db.insert(contribution).values({
    amountPaise: 50_000,
    channel: "upi",
    createdAt: now,
    fundId: GENERAL_FUND_ID,
    id: giftId,
    orgAccountId: bankId,
    partyId: INCOME_DONOR_ID,
    programmeId: EDUCATION_ID,
    receivedOn: "2026-06-05",
    reference: `E2EAP${code}`,
    reportingMode: "electronic_or_account_payee",
    status: "receipted",
    updatedAt: now,
  });
  const receipts = [
    { label: "void", sequence: 1, voided: true },
    { label: "live", sequence: 2, voided: false },
  ];
  const receiptNumbers: Record<string, string> = {};
  for (const r of receipts) {
    const id = uuidv7();
    const number = `E2E-AP/${code}/${r.sequence}`;
    receiptNumbers[r.label] = number;
    const key = `receipts/${id}/${uuidv7()}.pdf`;
    hashes[`Receipt ${r.label}`] = await store(key, `receipt ${r.label}`);
    await db.insert(contributionReceipt).values({
      contributionId: giftId,
      createdAt: now,
      fiscalYear: `e2e-${run}`,
      id,
      issuedBy: userId,
      issuedOn: "2026-06-06",
      number,
      sequence: r.sequence,
      voidedAt: r.voided ? now : null,
      voidedBy: r.voided ? userId : null,
      voidReason: r.voided ? "E2E: reissued" : null,
    });
    await db.insert(contributionReceiptSnapshot).values({
      createdAt: now,
      document: {},
      partyId: INCOME_DONOR_ID,
      pdfKey: key,
      pdfSha256: hashes[`Receipt ${r.label}`],
      receiptId: id,
    });
  }
  await postIncomeSourceNow({ sourceId: giftId, sourceType: "contribution" });

  // A submitted Form 113 filing of the gift, with its Form 114 certificate.
  // Numbered high so it never meets the filings spec's own.
  const filingId = uuidv7();
  const filingSequence = 900 + Math.floor(Math.random() * 99);
  const filingKey = `donation-filings/${filingId}.csv`;
  hashes["Upload file"] = await store(filingKey, `filing`);
  const rowId = uuidv7();
  const acknowledgement = `E2EAP114${code}`;
  const certificateKey = `donation-certificates/${uuidv7()}.pdf`;
  hashes.Certificate = await store(certificateKey, `form 114`);
  await db.transaction(async (tx) => {
    await tx.insert(donationFiling).values({
      acknowledgementNumber: `E2EAP113${code}`,
      createdAt: now,
      createdBy: userId,
      fileName: `donations-return-FY${YEAR}-filing-${filingSequence}.csv`,
      fileObjectKey: filingKey,
      fileSha256: hashes["Upload file"] ?? "",
      filedOn: "2026-07-31",
      fiscalYear: YEAR,
      giftCount: 1,
      id: filingId,
      rowCount: 1,
      sequence: filingSequence,
      status: "submitted",
      submittedAt: now,
      submittedBy: userId,
      totalPaise: 50_000,
      transactionId: `E2EAPTX${code}`,
    });
    await tx.insert(donationFilingRow).values({
      address: "1 Example Road, Bengaluru",
      amountPaise: 50_000,
      createdAt: now,
      donationTypeCode: "Specific grant",
      filingId,
      giftCount: 1,
      id: rowId,
      idCode: "PAN",
      idNumberEncrypted: encryptSecret("AAAPE9999E", filingRowIdContext(rowId)),
      idNumberLast4: "999E",
      idType: "pan",
      modeCode: "Electronic modes",
      name: "E2E Income Donor",
      partyId: INCOME_DONOR_ID,
      srNo: 1,
    });
    await tx.insert(donationFilingGift).values({
      amountPaise: 50_000,
      contributionId: giftId,
      filingId,
      rowId,
    });
    await tx.insert(donationCertificate).values({
      acknowledgementNumber: acknowledgement,
      createdAt: now,
      createdBy: userId,
      fileName: `Form-114-${acknowledgement}.pdf`,
      fileObjectKey: certificateKey,
      fileSha256: hashes.Certificate ?? "",
      filingId,
      id: uuidv7(),
      matchedBy: "details",
      rowId,
    });
  });

  // A utilisation certificate prepared in the year, awaiting the CA, with
  // its long-term copy and the CA's certificate.
  const certificateId = uuidv7();
  const ucNumber = `UC/E2E-AP/${code}`;
  const latestKey = `utilisation-certificates/${certificateId}/latest.pdf`;
  const archiveKey = `utilisation-certificates/${certificateId}/archive.pdf`;
  const caKey = `utilisation-certificates/${certificateId}/ca.pdf`;
  await store(latestKey, `uc latest`);
  hashes["Long-term copy"] = await store(archiveKey, `uc archive`);
  hashes["CA's certificate"] = await store(caKey, `uc ca`);
  const zero = {
    broughtForwardPaise: 0,
    closingPaise: 0,
    heads: [],
    interestBroughtForwardPaise: 0,
    interestPaise: 0,
    received: [],
    receivedPaise: 0,
    refundedPaise: 0,
    refunds: [],
    spentPaise: 0,
    totalAvailablePaise: 0,
  };
  await db.insert(utilisationCertificate).values({
    archiveObjectKey: archiveKey,
    archiveSha256: hashes["Long-term copy"],
    archivedAt: now,
    caFilename: "CA certificate.pdf",
    caObjectKey: caKey,
    caRequired: true,
    createdAt: now,
    financeSignedAt: now,
    financeTrusteeId: GOVERNANCE_SEED_IDS.jointManagingTrustee,
    fiscalYear: YEAR,
    fromOn: "2026-04-01",
    grantId,
    headSignedAt: now,
    headTrusteeId: GOVERNANCE_SEED_IDS.managingTrustee,
    id: certificateId,
    interestPaise: 0,
    latestObjectKey: latestKey,
    latestSha256: "0".repeat(64),
    number: ucNumber,
    sequence: 9000 + Math.floor(Math.random() * 900_000),
    snapshot: {
      caRequired: true,
      figures: zero,
      grant: {
        agreementOn: "2026-04-10",
        agreementReference: `E2E-AP-${code}`,
        grantor: "E2E grantor",
        programme: "Education",
        project: "E2E project",
        sanctionedPaise: 0,
        scheduleViiItem: "(ii) Promoting education",
        title: "E2E grant",
      },
      number: ucNumber,
      period: { from: "2026-04-01", to: "2026-09-30" },
      place: "Bengaluru",
      preparedOn: "2026-10-01",
      signatories: {
        finance: {
          name: "Vikram Menon",
          office: "joint_managing_trustee",
          trusteeId: GOVERNANCE_SEED_IDS.jointManagingTrustee,
        },
        head: {
          name: "Asha Rao",
          office: "managing_trustee",
          trusteeId: GOVERNANCE_SEED_IDS.managingTrustee,
        },
      },
      trust: {
        address: "1 Example Road, Bengaluru",
        csr1: null,
        name: "Example Trust",
        pan: "AAATE0000E",
        registration12ab: null,
        registration80g: null,
      },
      version: 1,
    },
    status: "awaiting_ca",
    toOn: "2026-09-30",
    updatedAt: now,
  });

  return {
    acknowledgement,
    claimId,
    code,
    filingId,
    filingSequence,
    giftId,
    hashes,
    paymentId,
    receiptNumbers,
    ucNumber,
    vendorPaymentId,
    yearId: year.id,
  };
}

async function auditRows(since: string) {
  const actorId = await userIdOf(process.env.FINANCE_ADMIN_EMAIL);
  return await db
    .select({
      metadata: auditLog.metadata,
      outcome: auditLog.outcome,
      targetId: auditLog.targetId,
      targetType: auditLog.targetType,
    })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.action, "books.audit_pack.download"),
        eq(auditLog.actorUserId, actorId),
        gte(auditLog.attemptedAt, new Date(since))
      )
    )
    .orderBy(desc(auditLog.attemptedAt));
}

async function cleanup(filingId: string) {
  await db.transaction(async (tx) => {
    await tx
      .delete(donationCertificate)
      .where(eq(donationCertificate.filingId, filingId));
    await tx
      .delete(donationFilingGift)
      .where(eq(donationFilingGift.filingId, filingId));
    await tx
      .delete(donationFilingRow)
      .where(eq(donationFilingRow.filingId, filingId));
    await tx
      .delete(donationFiling)
      .where(inArray(donationFiling.id, [filingId]));
  });
  return { removed: filingId };
}

const [action, first = "", second = ""] = process.argv.slice(2);
let result: unknown;
if (action === "seed") {
  result = await seed(first, second);
} else if (action === "audit") {
  result = await auditRows(first);
} else if (action === "cleanup") {
  result = await cleanup(first);
} else {
  throw new Error(`Unknown action ${action}`);
}
process.stdout.write(`${JSON.stringify(result)}\n`);
process.exit(0);
