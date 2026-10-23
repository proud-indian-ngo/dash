import { db } from "@pi-dash/db";
import { appConfig } from "@pi-dash/db/schema/app-config";
import { contributionReceipt } from "@pi-dash/db/schema/contribution-receipt";
import { governanceDocument } from "@pi-dash/db/schema/governance";
import {
  grantAgreement,
  utilisationCertificate,
} from "@pi-dash/db/schema/grant";
import {
  donationCertificate,
  donationFiling,
} from "@pi-dash/db/schema/private/donation-filings";
import { contributionReceiptSnapshot } from "@pi-dash/db/schema/private/receipts";
import {
  reimbursement,
  reimbursementAttachment,
} from "@pi-dash/db/schema/reimbursement";
import {
  vendor,
  vendorPayment,
  vendorPaymentAttachment,
} from "@pi-dash/db/schema/vendor";
import {
  vendorPaymentTransaction,
  vendorPaymentTransactionAttachment,
} from "@pi-dash/db/schema/vendor-payment-transaction";
import { LEDGER_SOURCE_TYPES } from "@pi-dash/shared/ledger";
import {
  parseReceiptSettingsParts,
  RECEIPT_SETTINGS_CONFIG_KEY,
} from "@pi-dash/shared/receipts";
import { and, asc, eq, inArray, ne } from "drizzle-orm";

import {
  documentReference,
  type WorkbookDocumentReference,
} from "@/lib/ca-workbook/sheets";
import { sanitizeArchivePathSegment } from "@/lib/server/financial-export-archive";

/**
 * Server only. The audit pack's contents (finance-ledger-cutover.md, "Audit
 * pack"): for each document the year's CA workbook names, the files the
 * dashboard keeps for it, and the year's filings and utilisation
 * certificates, which no workbook row names. Paths are readable and stable:
 * folder by document type, a record's date, name and the last 8 characters
 * of its ID, then what each file is.
 */

/** Rows of the index that name no workbook row. */
export const YEAR_DOCUMENTS_SHEET = "Year documents";

export const PACK_FOLDERS = {
  form113: "form-113",
  form114: "form-114",
  receipts: "donation-receipts",
  reimbursements: "reimbursements",
  utilisationCertificates: "utilisation-certificates",
  vendorPayments: "vendor-payments",
} as const;

/** A file the dashboard keeps for a document, or a link it holds instead. */
export interface PackFile {
  /** What the file is: "Bill 1", "Payment proof", "Receipt PI/2026-27/0001 (void)". */
  label: string;
  /** Null when the record names a file that was never stored. */
  objectKey: string | null;
  /** Shown in the index: why a file is missing, or a link's address. */
  note: string;
  /** ZIP path; set by `assignPaths`. */
  path: string;
  /** The file's name inside its folder, before de-duplication. */
  proposedName: string;
  folder: string;
  url: string | null;
}

/** One document of the index, with its files. */
export interface PackDocument {
  documentType: string;
  files: PackFile[];
  /** Why there is no file, when `files` is empty. */
  noFileNote: string;
  reference: string;
  sheet: string;
}

/** Sources that never have a stored file, and where their evidence lives. */
const NO_FILE_KEPT: Record<string, string> = {
  [LEDGER_SOURCE_TYPES.auditedFigures]:
    "Entered from the CA's signed balance sheet; the dashboard keeps no file.",
  [LEDGER_SOURCE_TYPES.contributionRefund]:
    "A Razorpay refund; the dashboard keeps no file.",
  [LEDGER_SOURCE_TYPES.gatewaySettlement]:
    "Settlement files (Razorpay's API, give.do's payout XLSX) aren't stored, only their figures.",
  [LEDGER_SOURCE_TYPES.openingBalance]:
    "Entered from the CA's signed opening figures; the dashboard keeps no file.",
  [LEDGER_SOURCE_TYPES.otherIncome]: "Other income carries no file.",
  [LEDGER_SOURCE_TYPES.statementCharge]:
    "A bank statement line; imported statement files aren't stored, only their lines.",
  [LEDGER_SOURCE_TYPES.statementTransfer]:
    "A bank statement line; imported statement files aren't stored, only their lines.",
};

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  [LEDGER_SOURCE_TYPES.auditedFigures]: "Audited figures",
  [LEDGER_SOURCE_TYPES.contribution]: "Contribution",
  [LEDGER_SOURCE_TYPES.contributionRefund]: "Refund",
  [LEDGER_SOURCE_TYPES.gatewaySettlement]: "Settlement",
  [LEDGER_SOURCE_TYPES.openingBalance]: "Opening balances",
  [LEDGER_SOURCE_TYPES.otherIncome]: "Other income",
  [LEDGER_SOURCE_TYPES.reimbursement]: "Reimbursement",
  [LEDGER_SOURCE_TYPES.statementCharge]: "Bank charge or tax",
  [LEDGER_SOURCE_TYPES.statementTransfer]: "Transfer",
  [LEDGER_SOURCE_TYPES.vendorPayment]: "Vendor payment",
  [LEDGER_SOURCE_TYPES.vendorPaymentTransaction]: "Vendor payment made",
};

const REIMBURSEMENT_FILE_LABELS: Record<string, string> = {
  payee_signature: "Payee signature",
  payment_proof: "Payment proof",
  receipt: "Bill",
  signed_voucher: "Signed cash voucher",
  voucher: "Cash voucher",
};

const VENDOR_FILE_LABELS: Record<string, string> = {
  invoice: "Invoice",
  quotation: "Quotation",
};

/** Postgres takes at most 65,535 parameters; a large year can name more IDs. */
const ID_CHUNK = 5000;

async function inChunks<T>(
  ids: string[],
  load: (chunk: string[]) => Promise<T[]>
): Promise<T[]> {
  const rows: T[] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    rows.push(...(await load(ids.slice(i, i + ID_CHUNK))));
  }
  return rows;
}

function byParent<T extends { parentId: string }>(rows: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const group = groups.get(row.parentId);
    if (group) {
      group.push(row);
    } else {
      groups.set(row.parentId, [row]);
    }
  }
  return groups;
}

const segment = (value: string | null | undefined, fallback: string) =>
  sanitizeArchivePathSegment(value ?? null, fallback);

const shortId = (id: string) => id.slice(-8);

/** ".pdf" from an object key or file name; empty when there is none. */
function extensionOf(name: string | null): string {
  const base = name?.split("/").at(-1) ?? "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot).toLowerCase() : "";
}

/** "Bill 1 - invoice.pdf", or "Payment proof.png" for an unnamed file. */
function fileName(
  label: string,
  original: string | null,
  objectKey: string | null
): string {
  return original
    ? `${label} - ${original}`
    : `${label}${extensionOf(objectKey)}`;
}

interface AttachmentRow {
  filename: string | null;
  label: string;
  objectKey: string | null;
  type: "file" | "url";
  url: string | null;
}

/** A record's attachments as files, numbered per label ("Bill 1", "Bill 2"). */
function attachmentFiles(
  folder: string,
  attachments: AttachmentRow[]
): PackFile[] {
  const counts = new Map<string, number>();
  for (const a of attachments) {
    counts.set(a.label, (counts.get(a.label) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  return attachments.map((a): PackFile => {
    const n = (seen.get(a.label) ?? 0) + 1;
    seen.set(a.label, n);
    const label = (counts.get(a.label) ?? 0) > 1 ? `${a.label} ${n}` : a.label;
    if (a.type === "url") {
      return {
        folder,
        label,
        note: a.url ?? "",
        objectKey: null,
        path: "",
        proposedName: "",
        url: a.url ?? "",
      };
    }
    return {
      folder,
      label,
      note: a.objectKey ? "" : "The record names a file that was never stored.",
      objectKey: a.objectKey,
      path: "",
      proposedName: fileName(label, a.filename, a.objectKey),
      url: null,
    };
  });
}

/** Adds the payment screenshot unless an attachment already holds it. */
function withScreenshot(
  rows: AttachmentRow[],
  screenshotKey: string | null
): AttachmentRow[] {
  if (!screenshotKey || rows.some((r) => r.objectKey === screenshotKey)) {
    return rows;
  }
  return [
    ...rows,
    {
      filename: null,
      label: "Payment proof",
      objectKey: screenshotKey,
      type: "file",
      url: null,
    },
  ];
}

async function reimbursementFiles(ids: string[]) {
  const [records, attachments] = await Promise.all([
    inChunks(ids, (chunk) =>
      db
        .select({
          approvalScreenshotKey: reimbursement.approvalScreenshotKey,
          expenseDate: reimbursement.expenseDate,
          id: reimbursement.id,
          title: reimbursement.title,
        })
        .from(reimbursement)
        .where(inArray(reimbursement.id, chunk))
    ),
    inChunks(ids, (chunk) =>
      db
        .select({
          filename: reimbursementAttachment.filename,
          objectKey: reimbursementAttachment.objectKey,
          parentId: reimbursementAttachment.reimbursementId,
          purpose: reimbursementAttachment.purpose,
          type: reimbursementAttachment.type,
          url: reimbursementAttachment.url,
        })
        .from(reimbursementAttachment)
        .where(inArray(reimbursementAttachment.reimbursementId, chunk))
        .orderBy(
          asc(reimbursementAttachment.createdAt),
          asc(reimbursementAttachment.id)
        )
    ),
  ]);
  const byRecord = byParent(attachments);
  const files = new Map<string, PackFile[]>();
  for (const r of records) {
    const folder = `${PACK_FOLDERS.reimbursements}/${segment(
      `${r.expenseDate ?? ""} ${r.title} ${shortId(r.id)}`,
      shortId(r.id)
    )}`;
    const rows = (byRecord.get(r.id) ?? []).map((a) => ({
      ...a,
      label: REIMBURSEMENT_FILE_LABELS[a.purpose] ?? a.purpose,
    }));
    files.set(
      r.id,
      attachmentFiles(folder, withScreenshot(rows, r.approvalScreenshotKey))
    );
  }
  return files;
}

const vendorPaymentFolder = (r: {
  id: string;
  invoiceDate: string | null;
  title: string;
  vendorName: string | null;
}) =>
  `${PACK_FOLDERS.vendorPayments}/${segment(
    `${r.invoiceDate ?? ""} ${r.vendorName ?? ""} ${r.title} ${shortId(r.id)}`,
    shortId(r.id)
  )}`;

async function vendorPaymentFiles(ids: string[]) {
  const [records, attachments] = await Promise.all([
    inChunks(ids, (chunk) =>
      db
        .select({
          approvalScreenshotKey: vendorPayment.approvalScreenshotKey,
          id: vendorPayment.id,
          invoiceDate: vendorPayment.invoiceDate,
          title: vendorPayment.title,
          vendorName: vendor.name,
        })
        .from(vendorPayment)
        .leftJoin(vendor, eq(vendor.id, vendorPayment.vendorId))
        .where(inArray(vendorPayment.id, chunk))
    ),
    inChunks(ids, (chunk) =>
      db
        .select({
          filename: vendorPaymentAttachment.filename,
          objectKey: vendorPaymentAttachment.objectKey,
          parentId: vendorPaymentAttachment.vendorPaymentId,
          purpose: vendorPaymentAttachment.purpose,
          type: vendorPaymentAttachment.type,
          url: vendorPaymentAttachment.url,
        })
        .from(vendorPaymentAttachment)
        .where(inArray(vendorPaymentAttachment.vendorPaymentId, chunk))
        .orderBy(
          asc(vendorPaymentAttachment.createdAt),
          asc(vendorPaymentAttachment.id)
        )
    ),
  ]);
  const byRecord = byParent(attachments);
  const files = new Map<string, PackFile[]>();
  for (const r of records) {
    const rows = (byRecord.get(r.id) ?? []).map((a) => ({
      ...a,
      label: VENDOR_FILE_LABELS[a.purpose] ?? a.purpose,
    }));
    files.set(
      r.id,
      attachmentFiles(
        vendorPaymentFolder(r),
        withScreenshot(rows, r.approvalScreenshotKey)
      )
    );
  }
  return files;
}

/** A payment's proof sits in its vendor payment's folder. */
async function vendorPaymentTransactionFiles(ids: string[]) {
  const [records, attachments] = await Promise.all([
    inChunks(ids, (chunk) =>
      db
        .select({
          id: vendorPaymentTransaction.id,
          invoiceDate: vendorPayment.invoiceDate,
          title: vendorPayment.title,
          transactionDate: vendorPaymentTransaction.transactionDate,
          vendorName: vendor.name,
          vendorPaymentId: vendorPayment.id,
        })
        .from(vendorPaymentTransaction)
        .innerJoin(
          vendorPayment,
          eq(vendorPayment.id, vendorPaymentTransaction.vendorPaymentId)
        )
        .leftJoin(vendor, eq(vendor.id, vendorPayment.vendorId))
        .where(inArray(vendorPaymentTransaction.id, chunk))
    ),
    inChunks(ids, (chunk) =>
      db
        .select({
          filename: vendorPaymentTransactionAttachment.filename,
          objectKey: vendorPaymentTransactionAttachment.objectKey,
          parentId:
            vendorPaymentTransactionAttachment.vendorPaymentTransactionId,
          type: vendorPaymentTransactionAttachment.type,
          url: vendorPaymentTransactionAttachment.url,
        })
        .from(vendorPaymentTransactionAttachment)
        .where(
          inArray(
            vendorPaymentTransactionAttachment.vendorPaymentTransactionId,
            chunk
          )
        )
        .orderBy(
          asc(vendorPaymentTransactionAttachment.createdAt),
          asc(vendorPaymentTransactionAttachment.id)
        )
    ),
  ]);
  const byRecord = byParent(attachments);
  const files = new Map<string, PackFile[]>();
  for (const r of records) {
    const day = r.transactionDate?.toISOString().slice(0, 10) ?? "";
    const rows = (byRecord.get(r.id) ?? []).map((a) => ({
      ...a,
      label: `Payment proof ${day}`,
    }));
    files.set(
      r.id,
      attachmentFiles(
        vendorPaymentFolder({ ...r, id: r.vendorPaymentId }),
        rows
      )
    );
  }
  return files;
}

/** Every receipt of each gift, voided ones too (the workbook can name them). */
async function receiptFiles(contributionIds: string[]) {
  const receipts = await inChunks(contributionIds, (chunk) =>
    db
      .select({
        contributionId: contributionReceipt.contributionId,
        number: contributionReceipt.number,
        pdfKey: contributionReceiptSnapshot.pdfKey,
        voidedAt: contributionReceipt.voidedAt,
      })
      .from(contributionReceipt)
      .leftJoin(
        contributionReceiptSnapshot,
        eq(contributionReceiptSnapshot.receiptId, contributionReceipt.id)
      )
      .where(inArray(contributionReceipt.contributionId, chunk))
      .orderBy(asc(contributionReceipt.issuedOn), asc(contributionReceipt.id))
  );
  const files = new Map<string, PackFile[]>();
  for (const r of receipts) {
    const voided = r.voidedAt !== null;
    const list = files.get(r.contributionId) ?? [];
    list.push({
      folder: PACK_FOLDERS.receipts,
      label: `Receipt ${r.number}${voided ? " (void)" : ""}`,
      note: r.pdfKey
        ? ""
        : "The PDF isn't stored yet: open the receipt once in the dashboard to store it.",
      objectKey: r.pdfKey,
      path: "",
      proposedName: `${r.number}${voided ? " VOID" : ""}.pdf`,
      url: null,
    });
    files.set(r.contributionId, list);
  }
  return files;
}

async function filingDocuments(fiscalYear: string): Promise<PackDocument[]> {
  const [filings, certificates] = await Promise.all([
    db
      .select({
        acknowledgementNumber: donationFiling.acknowledgementNumber,
        fileName: donationFiling.fileName,
        fileObjectKey: donationFiling.fileObjectKey,
        filedOn: donationFiling.filedOn,
        sequence: donationFiling.sequence,
        status: donationFiling.status,
      })
      .from(donationFiling)
      .where(
        and(
          eq(donationFiling.fiscalYear, fiscalYear),
          ne(donationFiling.status, "discarded")
        )
      )
      .orderBy(asc(donationFiling.sequence)),
    db
      .select({
        acknowledgementNumber: donationCertificate.acknowledgementNumber,
        fileName: donationCertificate.fileName,
        fileObjectKey: donationCertificate.fileObjectKey,
        sequence: donationFiling.sequence,
      })
      .from(donationCertificate)
      .innerJoin(
        donationFiling,
        eq(donationFiling.id, donationCertificate.filingId)
      )
      .where(
        and(
          eq(donationFiling.fiscalYear, fiscalYear),
          ne(donationFiling.status, "discarded")
        )
      )
      .orderBy(
        asc(donationFiling.sequence),
        asc(donationCertificate.acknowledgementNumber)
      ),
  ]);
  return [
    ...filings.map((f): PackDocument => ({
      documentType: "Form 113 filing",
      files: [
        {
          folder: PACK_FOLDERS.form113,
          label: "Upload file",
          note: f.acknowledgementNumber
            ? `Acknowledgement ${f.acknowledgementNumber}, filed on ${f.filedOn ?? ""}. The portal's acknowledgement is recorded as its number, not kept as a file.`
            : "Not submitted yet.",
          objectKey: f.fileObjectKey,
          path: "",
          proposedName: `Filing ${f.sequence} - ${f.fileName}`,
          url: null,
        },
      ],
      noFileNote: "",
      reference: `Form 113 filing ${f.sequence}`,
      sheet: YEAR_DOCUMENTS_SHEET,
    })),
    ...certificates.map((c): PackDocument => ({
      documentType: "Form 114 certificate",
      files: [
        {
          folder: PACK_FOLDERS.form114,
          label: "Certificate",
          note: `Filing ${c.sequence}`,
          objectKey: c.fileObjectKey,
          path: "",
          proposedName: c.fileName,
          url: null,
        },
      ],
      noFileNote: "",
      reference: `Form 114 certificate ${c.acknowledgementNumber}`,
      sheet: YEAR_DOCUMENTS_SHEET,
    })),
  ];
}

/**
 * Utilisation certificates prepared in the year: the signed copy served
 * today (the long-term copy once made, the vault's once filed) and the
 * CA's document. Discarded ones never had a final PDF.
 */
async function certificateDocuments(
  fiscalYear: string
): Promise<PackDocument[]> {
  const rows = await db
    .select({
      archiveObjectKey: utilisationCertificate.archiveObjectKey,
      caFilename: utilisationCertificate.caFilename,
      caObjectKey: utilisationCertificate.caObjectKey,
      grantTitle: grantAgreement.title,
      latestObjectKey: utilisationCertificate.latestObjectKey,
      number: utilisationCertificate.number,
      status: utilisationCertificate.status,
      vaultArchiveObjectKey: governanceDocument.archiveObjectKey,
    })
    .from(utilisationCertificate)
    .innerJoin(
      grantAgreement,
      eq(grantAgreement.id, utilisationCertificate.grantId)
    )
    .leftJoin(
      governanceDocument,
      eq(governanceDocument.id, utilisationCertificate.documentId)
    )
    .where(
      and(
        eq(utilisationCertificate.fiscalYear, fiscalYear),
        ne(utilisationCertificate.status, "discarded")
      )
    )
    .orderBy(asc(utilisationCertificate.sequence));
  return rows.map((c): PackDocument => {
    const name = segment(c.number, "certificate");
    const status = c.status === "cancelled" ? "Cancelled. " : "";
    const files: PackFile[] = [
      {
        folder: PACK_FOLDERS.utilisationCertificates,
        label: c.archiveObjectKey ? "Long-term copy" : "Latest copy",
        note: `${status}${c.status === "final" ? "" : "Not final yet."}`.trim(),
        objectKey:
          c.vaultArchiveObjectKey ?? c.archiveObjectKey ?? c.latestObjectKey,
        path: "",
        proposedName: `${name} - ${c.grantTitle}.pdf`,
        url: null,
      },
    ];
    if (c.caObjectKey) {
      files.push({
        folder: PACK_FOLDERS.utilisationCertificates,
        label: "CA's certificate",
        note: "",
        objectKey: c.caObjectKey,
        path: "",
        proposedName: `${name} CA - ${c.caFilename ?? `certificate${extensionOf(c.caObjectKey)}`}`,
        url: null,
      });
    }
    return {
      documentType: "Utilisation certificate",
      files,
      noFileNote: "",
      reference: `Utilisation certificate ${c.number}`,
      sheet: YEAR_DOCUMENTS_SHEET,
    };
  });
}

const NO_RECORD_FILES: Record<string, string> = {
  [LEDGER_SOURCE_TYPES.contribution]: "No receipt issued by the dashboard.",
  [LEDGER_SOURCE_TYPES.reimbursement]: "No file attached.",
  [LEDGER_SOURCE_TYPES.vendorPayment]: "No file attached.",
  [LEDGER_SOURCE_TYPES.vendorPaymentTransaction]: "No payment proof attached.",
};

/**
 * Gives every file one ZIP path: names made safe for any script, and a
 * name shared (ignoring case) within a folder gets a number. One stored
 * object keeps one path wherever it is listed.
 */
function assignPaths(documents: PackDocument[]): void {
  const byKey = new Map<string, string>();
  const taken = new Set<string>();
  for (const document of documents) {
    for (const file of document.files) {
      if (!file.proposedName) {
        continue;
      }
      const known = file.objectKey ? byKey.get(file.objectKey) : undefined;
      if (known) {
        file.path = known;
        continue;
      }
      const name = segment(file.proposedName, "file");
      const dot = name.lastIndexOf(".");
      const [stem, ext] =
        dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
      let path = `${file.folder}/${name}`;
      for (let n = 2; taken.has(path.toLocaleLowerCase("en-US")); n += 1) {
        path = `${file.folder}/${stem} (${n})${ext}`;
      }
      taken.add(path.toLocaleLowerCase("en-US"));
      file.path = path;
      if (file.objectKey) {
        byKey.set(file.objectKey, path);
      }
    }
  }
}

/**
 * The pack's documents: each workbook reference, in workbook order, then
 * the year's filings and certificates.
 */
export async function loadPackDocuments(
  references: WorkbookDocumentReference[],
  fiscalYear: string
): Promise<PackDocument[]> {
  const idsOf = (type: string) => [
    ...new Set(
      references.filter((r) => r.sourceType === type).map((r) => r.sourceId)
    ),
  ];
  const [reimbursements, vendorPayments, payments, receipts, filings, ucs] =
    await Promise.all([
      reimbursementFiles(idsOf(LEDGER_SOURCE_TYPES.reimbursement)),
      vendorPaymentFiles(idsOf(LEDGER_SOURCE_TYPES.vendorPayment)),
      vendorPaymentTransactionFiles(
        idsOf(LEDGER_SOURCE_TYPES.vendorPaymentTransaction)
      ),
      receiptFiles(idsOf(LEDGER_SOURCE_TYPES.contribution)),
      filingDocuments(fiscalYear),
      certificateDocuments(fiscalYear),
    ]);
  const filesBySource: Record<string, Map<string, PackFile[]>> = {
    [LEDGER_SOURCE_TYPES.contribution]: receipts,
    [LEDGER_SOURCE_TYPES.reimbursement]: reimbursements,
    [LEDGER_SOURCE_TYPES.vendorPayment]: vendorPayments,
    [LEDGER_SOURCE_TYPES.vendorPaymentTransaction]: payments,
  };
  const documents = references.map((r): PackDocument => {
    const files = filesBySource[r.sourceType]?.get(r.sourceId) ?? [];
    return {
      documentType: DOCUMENT_TYPE_LABELS[r.sourceType] ?? r.sourceType,
      files,
      noFileNote:
        NO_FILE_KEPT[r.sourceType] ??
        NO_RECORD_FILES[r.sourceType] ??
        "The dashboard keeps no file for this document.",
      reference: documentReference(r.sourceType, r.sourceId),
      sheet: r.sheet,
    };
  });
  const all = [...documents, ...filings, ...ucs];
  assignPaths(all);
  return all;
}

/** The trust's name as receipts print it, else the organisation's. */
export async function loadTrustName(): Promise<string> {
  const [row] = await db
    .select({ value: appConfig.value })
    .from(appConfig)
    .where(eq(appConfig.key, RECEIPT_SETTINGS_CONFIG_KEY))
    .limit(1);
  return (
    parseReceiptSettingsParts(row?.value).details?.orgName ?? "Proud Indian"
  );
}
