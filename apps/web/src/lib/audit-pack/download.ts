import { createHash } from "node:crypto";

import { createRequestLogger } from "evlog";
import { strToU8 } from "fflate";

import { assertServerPermission, requireSession } from "@/lib/api-auth";
import { buildAuditActor, recordFinalAudit } from "@/lib/audit";
import type { WorkbookSheet } from "@/lib/ca-workbook/sheets";
import { writeWorkbook } from "@/lib/ca-workbook/xlsx";
import { getS3 } from "@/lib/s3";
import { safeErrorName } from "@/lib/safe-errors";
import {
  createZipStream,
  type ZipStreamEntry,
} from "@/lib/server/financial-export-archive";

import { PACK_FOLDERS, type PackDocument } from "./documents";
import {
  liftIdleTimeout,
  type PackCounts,
  type PreparedAuditPack,
  takeAuditPack,
} from "./server";

/**
 * Server only. `GET /api/audit-pack?token=`: streams a pack prepared by
 * `prepareAuditPack` (finance-books.md#audit-pack) as a native download, so
 * nothing is buffered in the browser, and records how the stream ended as
 * `books.audit_pack.stream`. A bare GET, or another user's or a spent
 * token, starts nothing.
 */

const PATH = "/api/audit-pack";

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
      if (f.noFile) {
        return { cells: [...lead, f.label, INDEX_STATUS.none, "", "", f.note] };
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
    `- ${PACK_FOLDERS.grants}/: the signed agreement of each grant behind the year's income or certificates.`,
    `- ${PACK_FOLDERS.form113}/: the year's submitted donations return (Form 113) upload files.`,
    `- ${PACK_FOLDERS.form114}/: the Form 114 certificates the portal issued for them.`,
    `- ${PACK_FOLDERS.utilisationCertificates}/: utilisation certificates prepared in the year and signed by both trustees, and the CA's certificate for each.`,
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

/**
 * Passes a stored object through while hashing it; `done` gets the hex
 * SHA-256. A read that doesn't match the size seen in the preflight fails
 * the stream rather than writing a wrong file.
 */
function hashing(
  source: ReadableStream<Uint8Array>,
  expectedBytes: number,
  done: (sha256: string) => void
): ReadableStream<Uint8Array> {
  const hash = createHash("sha256");
  let bytes = 0;
  return source.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      flush() {
        if (bytes !== expectedBytes) {
          throw new Error("A stored file changed size while being packed");
        }
        done(hash.digest("hex"));
      },
      transform(chunk, controller) {
        bytes += chunk.length;
        hash.update(chunk);
        controller.enqueue(chunk);
      },
    })
  );
}

/** Why a pack GET started nothing, as the Books page's `auditPack` search param. */
type Refusal = "expired" | "forbidden" | "signed-out";

const REFUSALS: Record<Refusal, { message: string; status: number }> = {
  expired: {
    message: "This download has expired. Start it again from the Books page.",
    status: 404,
  },
  forbidden: { message: "Forbidden", status: 403 },
  "signed-out": { message: "Unauthorized", status: 401 },
};

/**
 * A refused GET, logged with its reason. The dialog opens the pack as a
 * browser navigation, so that goes back to the Books page, which shows the
 * reason as a toast, instead of leaving the tab on raw JSON.
 */
function refuse(request: Request, reason: Refusal, userId?: string): Response {
  const log = createRequestLogger({ method: "GET", path: PATH });
  log.set({ event: "audit_pack_refused", reason, userId });
  log.emit();
  if (request.headers.get("sec-fetch-mode") === "navigate") {
    return Response.redirect(
      new URL(`/finance/books?auditPack=${reason}`, request.url),
      303
    );
  }
  const { message, status } = REFUSALS[reason];
  return Response.json({ error: message }, { status });
}

/** A client that goes away mid-pull surfaces as an abort, not a failure. */
const isAbort = (request: Request, error: unknown) =>
  request.signal.aborted ||
  (error instanceof Error && error.name === "AbortError");

export async function handleAuditPackDownload(
  request: Request
): Promise<Response> {
  const auth = await requireSession(request);
  if (auth.error) {
    return refuse(request, "signed-out");
  }
  const { session } = auth;
  try {
    await assertServerPermission(session, "finance.view_sensitive");
  } catch {
    return refuse(request, "forbidden", session.user.id);
  }
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const found = takeAuditPack(token, session.user.id);
  if (!found) {
    return refuse(request, "expired", session.user.id);
  }
  const pack: PreparedAuditPack = found;
  liftIdleTimeout(request);

  const actor = await buildAuditActor(session);
  /** The stream's own audit row and log line, once it ends either way. */
  const finish = (
    outcome: "failure" | "success",
    metadata: Record<string, boolean | number>,
    error?: unknown
  ) => {
    const log = createRequestLogger({ method: "GET", path: PATH });
    log.set({
      event:
        outcome === "success"
          ? "audit_pack_streamed"
          : "audit_pack_stream_stopped",
      fiscalYearId: pack.fiscalYearId,
      userId: session.user.id,
      ...metadata,
      ...(error === undefined ? {} : { errorName: safeErrorName(error) }),
    });
    recordFinalAudit(
      {
        action: "books.audit_pack.stream",
        actor,
        metadata: { ...metadata, financialYear: pack.financialYear },
        target: { id: pack.fiscalYearId, type: "fiscal_year" },
      },
      outcome
    )
      .catch((auditError: unknown) => {
        log.set({ auditErrorName: safeErrorName(auditError) });
      })
      .finally(() => {
        if (outcome === "failure") {
          log.error(new Error("Audit pack stream stopped"));
        }
        log.emit();
      });
  };

  const s3 = getS3();
  const hashes = new Map<string, string>();
  const present = new Set(pack.files.map((f) => f.key));
  let streamedFileCount = 0;
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
    for (const file of pack.files) {
      request.signal.throwIfAborted();
      yield {
        path: file.path,
        stream: () =>
          hashing(s3.file(file.key).stream(), file.size, (sha) => {
            hashes.set(file.key, sha);
            streamedFileCount += 1;
          }),
      };
    }
    yield {
      bytes: await writeWorkbook([indexSheet(pack.documents, present, hashes)]),
      compress: false,
      path: "index.xlsx",
    };
  }
  const stream = createZipStream(entries, {
    onCancel: () => finish("failure", { cancelled: true, streamedFileCount }),
    onEnd: () => finish("success", { streamedFileCount }),
    onError: (error) =>
      finish(
        "failure",
        { cancelled: isAbort(request, error), streamedFileCount },
        error
      ),
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
