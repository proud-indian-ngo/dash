import { db } from "@pi-dash/db";
import { appConfig } from "@pi-dash/db/schema/app-config";
import { contributionReceipt } from "@pi-dash/db/schema/contribution-receipt";
import { governanceDocument } from "@pi-dash/db/schema/governance";
import {
  grantAgreement,
  utilisationCertificate,
} from "@pi-dash/db/schema/grant";
import { contribution } from "@pi-dash/db/schema/income";
import {
  donationCertificate,
  donationFiling,
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
import { and, asc, eq, inArray } from "drizzle-orm";

import {
  documentReference,
  type WorkbookDocumentReference,
} from "@/lib/ca-workbook/sheets";
import { sanitizeArchivePathSegment } from "@/lib/server/financial-export-archive";

/**
 * Server only. The audit pack's contents (finance-books.md#audit-pack): for
 * each document the year's CA workbook names, the files the dashboard keeps
 * for it, the signed agreement of each grant behind its income or
 * certificates, and the year's final filings and utilisation certificates,
 * which no workbook row names. Paths are readable and stable: folder by
 * document type, a record's date, name and the last 8 characters of its
 * ID, then what each file is.
 */

/** Rows of the index that name no workbook row. */
export const YEAR_DOCUMENTS_SHEET = "Year documents";

export const PACK_FOLDERS = {
  form113: "form-113",
  form114: "form-114",
  grants: "grants",
  receipts: "donation-receipts",
  reimbursements: "reimbursements",
  utilisationCertificates: "utilisation-certificates",
  vendorPayments: "vendor-payments",
} as const;

/** A file the dashboard keeps for a document, or a link it holds instead. */
export interface PackFile {
  folder: string;
  /** What the file is: "Bill 1", "Payment proof", "Receipt PI/2026-27/0001 (void)". */
  label: string;
  /** The file's safe name inside its folder, before de-duplication. */
  name: string;
  /** A raw CSV that must pass the spreadsheet-formula check before release. */
  formulaSafeCsv?: boolean;
  /** No file is kept (a grant without its agreement): "No file", never "Missing". */
  noFile?: boolean;
  /** Why a file is missing or superseded, or a link's address. */
  note: string;
  /** Null when the record names a file that was never stored. */
  objectKey: string | null;
  /** ZIP path; set by `assignPaths`. */
  path: string;
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

const NO_RECORD_FILES: Record<string, string> = {
  [LEDGER_SOURCE_TYPES.contribution]: "No receipt issued by the dashboard.",
  [LEDGER_SOURCE_TYPES.reimbursement]: "No file attached.",
  [LEDGER_SOURCE_TYPES.vendorPayment]: "No file attached.",
  [LEDGER_SOURCE_TYPES.vendorPaymentTransaction]: "No payment proof attached.",
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

const SUPERSEDED = "Superseded: a later file replaced it; kept as evidence.";
const VOIDED =
  "The record was voided: the workbook shows its posting and the reversal.";

// ── Names ───────────────────────────────────────────────────────────────────

/** Names a CA unzips on Windows: under its path limits and never reserved. */
const MAX_NAME = 80;
const RESERVED_STEM = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const TRAILING_UNSAFE = /[-. ]+$/;
const SAFE_EXTENSION = /^\.[A-Za-z0-9]{1,10}$/;

/**
 * A folder or file name: `free` made safe for any script and cut so that
 * `tail` (a short ID, an extension) still fits in 80 characters, trailing
 * dots and spaces stripped again after the cut, and a Windows-reserved
 * stem ("CON", "lpt1.pdf") prefixed with "_".
 */
export function packName(free: string, tail = ""): string {
  const room = Math.max(MAX_NAME - tail.length, 8);
  const cut = [...sanitizeArchivePathSegment(free, "file")]
    .slice(0, room)
    .join("")
    .replace(TRAILING_UNSAFE, "");
  const name = `${cut || "file"}${tail}`;
  const stem = name.split(".")[0]?.trim() ?? "";
  return RESERVED_STEM.test(stem) ? `_${name}` : name;
}

/** ".pdf" from a file name or object key; empty when it has none or an odd one. */
function extensionOf(name: string | null): string {
  const base = name?.split("/").at(-1) ?? "";
  const dot = base.lastIndexOf(".");
  const extension = dot > 0 ? base.slice(dot).toLowerCase() : "";
  return SAFE_EXTENSION.test(extension) ? extension : "";
}

/** A file name without its extension. */
function stemOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

/** "Bill 1 - invoice.pdf", or "Payment proof.png" for an unnamed file. */
function fileName(
  label: string,
  original: string | null,
  objectKey: string | null
): string {
  const extension = extensionOf(original) || extensionOf(objectKey);
  return packName(
    original ? `${label} - ${stemOf(original)}` : label,
    extension
  );
}

const shortId = (id: string) => id.slice(-8);

const recordFolder = (root: string, text: string, id: string) =>
  `${root}/${packName(text, ` ${shortId(id)}`)}`;

// ── Loading ─────────────────────────────────────────────────────────────────

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

interface AttachmentRow {
  filename: string | null;
  label: string;
  note: string;
  objectKey: string | null;
  type: "file" | "url";
  url: string | null;
}

/** A record's attachments as files, numbered per label ("Bill 1", "Bill 2"). */
function attachmentFiles(
  folder: string,
  attachments: AttachmentRow[],
  recordNote: string
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
    const note = [a.note, recordNote].filter(Boolean).join(" ");
    if (a.type === "url") {
      return {
        folder,
        label,
        name: "",
        note: [a.url ?? "", note].filter(Boolean).join(" "),
        objectKey: null,
        path: "",
        url: a.url ?? "",
      };
    }
    return {
      folder,
      label,
      name: fileName(label, a.filename, a.objectKey),
      note: a.objectKey
        ? note
        : ["The record names a file that was never stored.", note]
            .filter(Boolean)
            .join(" "),
      objectKey: a.objectKey,
      path: "",
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
      note: "",
      objectKey: screenshotKey,
      type: "file",
      url: null,
    },
  ];
}

async function reimbursementFiles(ids: string[]) {
  const [records, attachments, lines] = await Promise.all([
    inChunks(ids, (chunk) =>
      db
        .select({
          approvalScreenshotKey: reimbursement.approvalScreenshotKey,
          expenseDate: reimbursement.expenseDate,
          id: reimbursement.id,
          title: reimbursement.title,
          voidedAt: reimbursement.voidedAt,
        })
        .from(reimbursement)
        .where(inArray(reimbursement.id, chunk))
    ),
    inChunks(ids, (chunk) =>
      db
        .select({
          filename: reimbursementAttachment.filename,
          id: reimbursementAttachment.id,
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
    // The vouchers, signed copies and signatures each line points at now.
    inChunks(ids, (chunk) =>
      db
        .select({
          payeeSignatureAttachmentId:
            reimbursementLineItem.payeeSignatureAttachmentId,
          signedVoucherAttachmentId:
            reimbursementLineItem.signedVoucherAttachmentId,
          voucherAttachmentId: reimbursementLineItem.voucherAttachmentId,
        })
        .from(reimbursementLineItem)
        .where(inArray(reimbursementLineItem.reimbursementId, chunk))
    ),
  ]);
  const current = new Set(
    lines.flatMap((l) =>
      [
        l.payeeSignatureAttachmentId,
        l.signedVoucherAttachmentId,
        l.voucherAttachmentId,
      ].filter((id): id is string => id !== null)
    )
  );
  const byRecord = byParent(attachments);
  const files = new Map<string, PackFile[]>();
  for (const r of records) {
    const rows = (byRecord.get(r.id) ?? []).map((a): AttachmentRow => {
      const replacedProof =
        a.purpose === "payment_proof" &&
        r.approvalScreenshotKey !== null &&
        a.objectKey !== r.approvalScreenshotKey;
      const replacedLineFile =
        (a.purpose === "voucher" ||
          a.purpose === "signed_voucher" ||
          a.purpose === "payee_signature") &&
        !current.has(a.id);
      return {
        ...a,
        label: REIMBURSEMENT_FILE_LABELS[a.purpose] ?? a.purpose,
        note: replacedProof || replacedLineFile ? SUPERSEDED : "",
      };
    });
    files.set(
      r.id,
      attachmentFiles(
        recordFolder(
          PACK_FOLDERS.reimbursements,
          `${r.expenseDate ?? ""} ${r.title}`,
          r.id
        ),
        withScreenshot(rows, r.approvalScreenshotKey),
        r.voidedAt ? VOIDED : ""
      )
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
  recordFolder(
    PACK_FOLDERS.vendorPayments,
    `${r.invoiceDate ?? ""} ${r.vendorName ?? ""} ${r.title}`,
    r.id
  );

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
          voidedAt: vendorPayment.voidedAt,
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
    const rows = (byRecord.get(r.id) ?? []).map((a): AttachmentRow => ({
      ...a,
      label: VENDOR_FILE_LABELS[a.purpose] ?? a.purpose,
      note: "",
    }));
    files.set(
      r.id,
      attachmentFiles(
        vendorPaymentFolder(r),
        withScreenshot(rows, r.approvalScreenshotKey),
        r.voidedAt ? VOIDED : ""
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
          voidedAt: vendorPaymentTransaction.voidedAt,
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
    const rows = (byRecord.get(r.id) ?? []).map((a): AttachmentRow => ({
      ...a,
      label: `Payment proof ${day}`,
      note: "",
    }));
    files.set(
      r.id,
      attachmentFiles(
        vendorPaymentFolder({ ...r, id: r.vendorPaymentId }),
        rows,
        r.voidedAt ? VOIDED : ""
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
      name: packName(`${r.number}${voided ? " VOID" : ""}`, ".pdf"),
      note: r.pdfKey
        ? ""
        : "The PDF isn't stored yet: open the receipt once in the dashboard to store it.",
      objectKey: r.pdfKey,
      path: "",
      url: null,
    });
    files.set(r.contributionId, list);
  }
  return files;
}

interface GrantRow {
  agreementFilename: string | null;
  agreementObjectKey: string | null;
  id: string;
  title: string;
}

/** A grant's signed agreement, or a "No file" row when none is stored. */
function agreementFile(grant: GrantRow): PackFile {
  const stored = grant.agreementObjectKey !== null;
  return {
    folder: PACK_FOLDERS.grants,
    label: "Grant agreement",
    name: stored
      ? packName(
          `${grant.title} agreement`,
          ` ${shortId(grant.id)}${extensionOf(grant.agreementFilename) || extensionOf(grant.agreementObjectKey)}`
        )
      : "",
    noFile: !stored,
    note: stored ? "" : "No signed agreement is stored for this grant.",
    objectKey: grant.agreementObjectKey,
    path: "",
    url: null,
  };
}

async function loadGrants(ids: string[]): Promise<Map<string, GrantRow>> {
  const rows = await inChunks(ids, (chunk) =>
    db
      .select({
        agreementFilename: grantAgreement.agreementFilename,
        agreementObjectKey: grantAgreement.agreementObjectKey,
        id: grantAgreement.id,
        title: grantAgreement.title,
      })
      .from(grantAgreement)
      .where(inArray(grantAgreement.id, chunk))
  );
  return new Map(rows.map((row) => [row.id, row]));
}

/** The grant each gift was received under, for gifts under one. */
async function contributionGrants(ids: string[]) {
  const rows = await inChunks(ids, (chunk) =>
    db
      .select({ grantId: contribution.grantId, id: contribution.id })
      .from(contribution)
      .where(inArray(contribution.id, chunk))
  );
  return new Map(
    rows.flatMap((r) => (r.grantId ? [[r.id, r.grantId] as const] : []))
  );
}

/** Submitted filings only: a prepared one isn't final. */
async function filingDocuments(fiscalYear: string): Promise<PackDocument[]> {
  const submitted = and(
    eq(donationFiling.fiscalYear, fiscalYear),
    eq(donationFiling.status, "submitted")
  );
  const [filings, certificates] = await Promise.all([
    db
      .select({
        acknowledgementNumber: donationFiling.acknowledgementNumber,
        fileName: donationFiling.fileName,
        fileObjectKey: donationFiling.fileObjectKey,
        filedOn: donationFiling.filedOn,
        sequence: donationFiling.sequence,
      })
      .from(donationFiling)
      .where(submitted)
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
      .where(submitted)
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
          formulaSafeCsv: true,
          label: "Upload file",
          name: packName(
            `Filing ${f.sequence} - ${stemOf(f.fileName)}`,
            extensionOf(f.fileName)
          ),
          note: `Acknowledgement ${f.acknowledgementNumber ?? ""}, filed on ${f.filedOn ?? ""}. The portal's acknowledgement is recorded as its number, not kept as a file.`,
          objectKey: f.fileObjectKey,
          path: "",
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
          name: packName(stemOf(c.fileName), extensionOf(c.fileName)),
          note: `Filing ${c.sequence}`,
          objectKey: c.fileObjectKey,
          path: "",
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
 * Utilisation certificates prepared in the year that both trustees have
 * signed: final, or awaiting only the CA. Each gives the copy downloads
 * serve (the vault's long-term copy once filed, else the certificate's own,
 * else the latest signed PDF) and the CA's document.
 */
async function certificateRows(fiscalYear: string) {
  return await db
    .select({
      archiveObjectKey: utilisationCertificate.archiveObjectKey,
      caFilename: utilisationCertificate.caFilename,
      caObjectKey: utilisationCertificate.caObjectKey,
      grantId: utilisationCertificate.grantId,
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
        inArray(utilisationCertificate.status, ["final", "awaiting_ca"])
      )
    )
    .orderBy(asc(utilisationCertificate.sequence));
}

function certificateDocument(
  c: Awaited<ReturnType<typeof certificateRows>>[number]
): PackDocument {
  const [label, objectKey] = c.vaultArchiveObjectKey
    ? ["Long-term copy (vault)", c.vaultArchiveObjectKey]
    : c.archiveObjectKey
      ? ["Long-term copy", c.archiveObjectKey]
      : ["Signed copy", c.latestObjectKey];
  const files: PackFile[] = [
    {
      folder: PACK_FOLDERS.utilisationCertificates,
      label,
      name: packName(`${c.number} - ${c.grantTitle}`, ".pdf"),
      note: c.status === "final" ? "" : "Awaiting the CA's certificate.",
      objectKey,
      path: "",
      url: null,
    },
  ];
  if (c.caObjectKey) {
    const original = c.caFilename ?? "";
    files.push({
      folder: PACK_FOLDERS.utilisationCertificates,
      label: "CA's certificate",
      name: packName(
        `${c.number} CA - ${original ? stemOf(original) : "certificate"}`,
        extensionOf(original) || extensionOf(c.caObjectKey)
      ),
      note: "",
      objectKey: c.caObjectKey,
      path: "",
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
}

/**
 * Gives every file one ZIP path: a name shared (ignoring case) within a
 * folder gets a number. One stored object keeps one path wherever it is
 * listed.
 */
function assignPaths(documents: PackDocument[]): void {
  const byKey = new Map<string, string>();
  const taken = new Set<string>();
  for (const document of documents) {
    for (const file of document.files) {
      if (!(file.name && file.objectKey)) {
        continue;
      }
      const known = byKey.get(file.objectKey);
      if (known) {
        file.path = known;
        continue;
      }
      const dot = file.name.lastIndexOf(".");
      const [stem, extension] =
        dot > 0
          ? [file.name.slice(0, dot), file.name.slice(dot)]
          : [file.name, ""];
      let path = `${file.folder}/${file.name}`;
      for (let n = 2; taken.has(path.toLocaleLowerCase("en-US")); n += 1) {
        path = `${file.folder}/${stem} (${n})${extension}`;
      }
      taken.add(path.toLocaleLowerCase("en-US"));
      file.path = path;
      byKey.set(file.objectKey, path);
    }
  }
}

/**
 * The pack's documents: each workbook reference, in workbook order, then
 * the year's filings and certificates. Gifts under a grant and the
 * certificates carry the grant's agreement.
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
  const contributionIds = idsOf(LEDGER_SOURCE_TYPES.contribution);
  const [
    reimbursements,
    vendorPayments,
    payments,
    receipts,
    giftGrants,
    filings,
    certificates,
  ] = await Promise.all([
    reimbursementFiles(idsOf(LEDGER_SOURCE_TYPES.reimbursement)),
    vendorPaymentFiles(idsOf(LEDGER_SOURCE_TYPES.vendorPayment)),
    vendorPaymentTransactionFiles(
      idsOf(LEDGER_SOURCE_TYPES.vendorPaymentTransaction)
    ),
    receiptFiles(contributionIds),
    contributionGrants(contributionIds),
    filingDocuments(fiscalYear),
    certificateRows(fiscalYear),
  ]);
  const grants = await loadGrants([
    ...new Set([...giftGrants.values(), ...certificates.map((c) => c.grantId)]),
  ]);
  const agreementOf = (grantId: string | undefined) => {
    const grant = grantId ? grants.get(grantId) : undefined;
    return grant ? [agreementFile(grant)] : [];
  };
  const filesBySource: Record<string, Map<string, PackFile[]>> = {
    [LEDGER_SOURCE_TYPES.contribution]: receipts,
    [LEDGER_SOURCE_TYPES.reimbursement]: reimbursements,
    [LEDGER_SOURCE_TYPES.vendorPayment]: vendorPayments,
    [LEDGER_SOURCE_TYPES.vendorPaymentTransaction]: payments,
  };
  const documents = references.map((r): PackDocument => {
    const files = [
      ...(filesBySource[r.sourceType]?.get(r.sourceId) ?? []),
      ...(r.sourceType === LEDGER_SOURCE_TYPES.contribution
        ? agreementOf(giftGrants.get(r.sourceId))
        : []),
    ];
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
  const certificateDocuments = certificates.map((c) => {
    const document = certificateDocument(c);
    document.files.push(...agreementOf(c.grantId));
    return document;
  });
  const all = [...documents, ...filings, ...certificateDocuments];
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
