import { createHash } from "node:crypto";

import { CaWorkbookRefusal } from "@pi-dash/db/queries/ca-workbook";
import { createRequestLogger } from "evlog";
import { strToU8 } from "fflate";
import { z } from "zod";

import { assertServerPermission, requireSession } from "@/lib/api-auth";
import { runSessionAuditedAction } from "@/lib/audit";
import { buildCaWorkbook } from "@/lib/ca-workbook/server";
import {
  type WorkbookSheet,
  workbookDocumentReferences,
} from "@/lib/ca-workbook/sheets";
import { writeWorkbook } from "@/lib/ca-workbook/xlsx";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getS3 } from "@/lib/s3";
import { safeErrorName } from "@/lib/safe-errors";
import {
  createZipStream,
  mapWithConcurrency,
  type ZipStreamEntry,
} from "@/lib/server/financial-export-archive";

import {
  loadPackDocuments,
  loadTrustName,
  PACK_FOLDERS,
  type PackDocument,
} from "./documents";

/**
 * Server only. `GET /api/audit-pack?fiscalYearId=…`: one ZIP per financial
 * year with the CA workbook, every stored document its rows name, the
 * year's filings and utilisation certificates, an index and a README
 * (finance-ledger-cutover.md, "Audit pack"). It carries full ID numbers
 * and bank details, so it needs `finance.view_sensitive` and every
 * download is audited, like the CA's file of every gift.
 *
 * Everything that can fail is done before the response: the workbook,
 * the documents and a check that each object exists, all inside the
 * audited action. An object storage doesn't hold becomes a "Missing" row,
 * never a broken ZIP. The files then stream one at a time, hashed on the
 * way, and the index (with each file's SHA-256) is written last.
 */

const PATH = "/api/audit-pack";
/** Each pack reads every file of a year; a few a quarter-hour is plenty. */
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 15 * 60_000;
/** Existence checks in flight; reads stay one at a time. */
const PREFLIGHT_CONCURRENCY = 8;
/**
 * fflate writes no ZIP64, so an archive must stay under 4 GiB and 65,535
 * entries. The margin leaves room for the workbook, the index and headers.
 */
const MAX_FILE_BYTES = 3.5 * 1024 ** 3;
const MAX_FILES = 60_000;

/** A pack that can't be made, written for the person downloading. */
class AuditPackRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuditPackRefusal";
  }
}

export const auditPackFilename = (label: string) =>
  `proud-indian-audit-pack-${label}.zip`;

const INDEX_COLUMNS = [
  { header: "Sheet", width: 26 },
  { header: "Document type", width: 22 },
  { header: "Document type and reference", width: 48 },
  { header: "File", width: 30 },
  { header: "Status", width: 10 },
  { header: "Path in this pack", width: 70 },
  { header: "SHA-256", width: 66 },
  { header: "Note", width: 60 },
].map((c) => ({ ...c, kind: "text" as const }));

export const INDEX_STATUS = {
  included: "Included",
  link: "Link",
  missing: "Missing",
  none: "No file",
} as const;

/** One row per file of each document, or one saying why it has none. */
function indexSheet(
  documents: PackDocument[],
  present: Set<string>,
  hashes: Map<string, string>
): WorkbookSheet {
  const rows = documents.flatMap((d) => {
    const lead = [d.sheet, d.documentType, d.reference];
    if (d.files.length === 0) {
      return [
        { cells: [...lead, "", INDEX_STATUS.none, "", "", d.noFileNote] },
      ];
    }
    return d.files.map((f) => {
      if (f.url !== null) {
        return { cells: [...lead, f.label, INDEX_STATUS.link, "", "", f.note] };
      }
      if (!(f.objectKey && present.has(f.objectKey))) {
        return {
          cells: [
            ...lead,
            f.label,
            INDEX_STATUS.missing,
            "",
            "",
            f.note || "Not found in storage.",
          ],
        };
      }
      return {
        cells: [
          ...lead,
          f.label,
          INDEX_STATUS.included,
          f.path,
          hashes.get(f.objectKey) ?? "",
          f.note,
        ],
      };
    });
  });
  return { columns: INDEX_COLUMNS, name: "Index", rows };
}

interface PackCounts {
  documentCount: number;
  fileCount: number;
  missingCount: number;
}

function readme(input: {
  counts: PackCounts;
  financialYear: string;
  generatedAt: Date;
  generatedBy: string;
  trustName: string;
  workbookFilename: string;
}): string {
  const at = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(input.generatedAt);
  return [
    `${input.trustName}: audit pack for FY ${input.financialYear}`,
    "",
    `Generated on ${at} (India time) by ${input.generatedBy}, from the dashboard.`,
    "",
    "What each part holds",
    `- ${input.workbookFilename}: the CA workbook, built for this pack exactly as the Books page downloads it. It is a fresh download: if the books changed since the CA signed a copy, the two differ. Keep the signed copy.`,
    "- index.xlsx: one row for each file of each document a workbook row names, with the sheet, the document's type and reference as the workbook prints them, the file's path in this pack and its SHA-256. Missing means the dashboard names a file that storage doesn't hold; No file means none is kept for that document; Link means the claimant gave a link, not a file. Rows on the Year documents sheet are named by no workbook row.",
    `- ${PACK_FOLDERS.reimbursements}/: per claim, by expense date: bills, payment proof, cash vouchers and their signed copies.`,
    `- ${PACK_FOLDERS.vendorPayments}/: per vendor payment, by invoice date: quotations, invoices and the proof of each payment made.`,
    `- ${PACK_FOLDERS.receipts}/: donation receipts as issued and stored. A voided receipt ends in VOID; the workbook can still name it.`,
    `- ${PACK_FOLDERS.form113}/: the year's donations return (Form 113) upload files.`,
    `- ${PACK_FOLDERS.form114}/: the Form 114 certificates the portal issued for them.`,
    `- ${PACK_FOLDERS.utilisationCertificates}/: utilisation certificates prepared in the year, as signed, and the CA's certificate for each.`,
    "",
    "Counts",
    `- Documents indexed: ${input.counts.documentCount}`,
    `- Files included: ${input.counts.fileCount}`,
    `- Files missing: ${input.counts.missingCount}`,
    "",
    "Not in this pack: bank statement and settlement files (the dashboard keeps only their lines and figures), and governance documents.",
    "",
    "This pack holds full ID numbers and bank details. Keep it private.",
    "",
  ].join("\n");
}

/** Passes a stream through while hashing it; `done` gets the hex SHA-256. */
function hashing(
  source: ReadableStream<Uint8Array>,
  done: (sha256: string) => void
): ReadableStream<Uint8Array> {
  const hash = createHash("sha256");
  return source.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      flush() {
        done(hash.digest("hex"));
      },
      transform(chunk, controller) {
        hash.update(chunk);
        controller.enqueue(chunk);
      },
    })
  );
}

async function preparePack(fiscalYearId: string) {
  // The pack needs finance.view_sensitive, which may always see donors.
  const built = await buildCaWorkbook({ fiscalYearId, includeDonors: true });
  const references = workbookDocumentReferences(
    built.sources.facts,
    built.sources.gifts
  );
  const [documents, trustName] = await Promise.all([
    loadPackDocuments(references, built.financialYear),
    loadTrustName(),
  ]);
  const files = new Map<string, string>();
  for (const d of documents) {
    for (const f of d.files) {
      if (f.objectKey && f.path) {
        files.set(f.objectKey, f.path);
      }
    }
  }
  const s3 = getS3();
  const present = new Set<string>();
  let totalBytes = 0;
  await mapWithConcurrency(
    [...files.keys()],
    PREFLIGHT_CONCURRENCY,
    async (key) => {
      const file = s3.file(key);
      // A failed stat is a missing object only when it doesn't exist.
      const stat = await file
        .stat()
        .catch(async (error: unknown) =>
          (await file.exists()) ? Promise.reject(error) : null
        );
      if (stat) {
        present.add(key);
        totalBytes += stat.size;
      }
    }
  );
  const fileCount = present.size;
  if (totalBytes > MAX_FILE_BYTES || fileCount > MAX_FILES) {
    throw new AuditPackRefusal(
      "This year's files are more than one ZIP can hold (3.5 GB or 60,000 files). Ask for the pack to be split."
    );
  }
  const listed = documents.flatMap((d) => d.files);
  const counts: PackCounts = {
    documentCount: documents.length,
    fileCount,
    missingCount: listed.filter(
      (f) => f.url === null && !(f.objectKey && present.has(f.objectKey))
    ).length,
  };
  return {
    counts,
    documents,
    files: [...files].filter(([key]) => present.has(key)),
    financialYear: built.financialYear,
    present,
    trustName,
    workbook: {
      bytes: Buffer.from(built.file.base64, "base64"),
      filename: built.file.filename,
    },
  };
}

export async function handleAuditPackRequest(
  request: Request
): Promise<Response> {
  const auth = await requireSession(request);
  if (auth.error) {
    return auth.error;
  }
  const { session } = auth;
  const fiscalYearId = z
    .uuid()
    .safeParse(new URL(request.url).searchParams.get("fiscalYearId"));
  if (!fiscalYearId.success) {
    return Response.json({ error: "Invalid financial year" }, { status: 400 });
  }
  try {
    await assertServerPermission(session, "finance.view_sensitive");
  } catch {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const limit = checkRateLimit(
    `audit-pack:${session.user.id}`,
    RATE_LIMIT,
    RATE_WINDOW_MS
  );
  if (!limit.allowed) {
    return rateLimitResponse(limit);
  }

  const log = createRequestLogger({ method: "GET", path: PATH });
  log.set({ fiscalYearId: fiscalYearId.data, userId: session.user.id });
  let pack: Awaited<ReturnType<typeof preparePack>>;
  try {
    pack = await runSessionAuditedAction(
      session,
      request.headers,
      {
        action: "books.audit_pack.download",
        target: { id: fiscalYearId.data, type: "fiscal_year" },
      },
      () => preparePack(fiscalYearId.data),
      undefined,
      undefined,
      (result) => ({ ...result.counts, financialYear: result.financialYear })
    );
  } catch (error) {
    if (
      error instanceof CaWorkbookRefusal ||
      error instanceof AuditPackRefusal
    ) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    log.set({ errorName: safeErrorName(error) });
    log.error(new Error("Audit pack failed"));
    log.emit();
    return Response.json(
      { error: "The audit pack couldn't be built." },
      { status: 500 }
    );
  }
  log.set({ ...pack.counts });
  log.emit();

  const s3 = getS3();
  const hashes = new Map<string, string>();
  const readmeText = readme({
    counts: pack.counts,
    financialYear: pack.financialYear,
    generatedAt: new Date(),
    generatedBy: session.user.name,
    trustName: pack.trustName,
    workbookFilename: pack.workbook.filename,
  });
  async function* entries(): AsyncGenerator<ZipStreamEntry> {
    yield { bytes: strToU8(readmeText), compress: true, path: "README.txt" };
    yield {
      bytes: pack.workbook.bytes,
      compress: false,
      path: pack.workbook.filename,
    };
    for (const [key, path] of pack.files) {
      yield {
        path,
        stream: () =>
          hashing(s3.file(key).stream(), (sha) => hashes.set(key, sha)),
      };
    }
    yield {
      bytes: await writeWorkbook([
        indexSheet(pack.documents, pack.present, hashes),
      ]),
      compress: false,
      path: "index.xlsx",
    };
  }
  const stream = createZipStream(entries, (error) => {
    const streamLog = createRequestLogger({ method: "GET", path: PATH });
    streamLog.set({
      errorName: safeErrorName(error),
      event: "audit_pack_stream_failed",
      fiscalYearId: fiscalYearId.data,
      userId: session.user.id,
    });
    streamLog.error(new Error("Audit pack stream failed"));
    streamLog.emit();
  });
  return new Response(stream, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Disposition": `attachment; filename="${auditPackFilename(pack.financialYear)}"`,
      "Content-Type": "application/zip",
      Vary: "Cookie",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
