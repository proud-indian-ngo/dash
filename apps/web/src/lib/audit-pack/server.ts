import { randomBytes } from "node:crypto";

import { buildCaWorkbook } from "@/lib/ca-workbook/server";
import { workbookDocumentReferences } from "@/lib/ca-workbook/sheets";
import { isSpreadsheetSafeCsv } from "@/lib/csv-formula-safety";
import { getS3 } from "@/lib/s3";
import { mapWithConcurrency } from "@/lib/server/financial-export-archive";

import { loadPackDocuments, loadTrustName } from "./documents";

/**
 * Server only. A financial year's audit pack (finance-books.md#audit-pack),
 * in two steps. `prepareAuditPack` (the books server function, audited)
 * builds the workbook and the document list and checks every object, then
 * hands back a single-use token bound to the user; `download.ts` streams it.
 * Tokens live in this process, like the rate limiter: one app instance.
 */

/** Existence checks in flight; reads stay one at a time. */
const PREFLIGHT_CONCURRENCY = 8;
/**
 * fflate writes no ZIP64, so an archive must stay under 4 GiB and 65,535
 * entries. The margin leaves room for the workbook, the index and headers.
 */
const MAX_FILE_BYTES = 3.5 * 1024 ** 3;
const MAX_FILES = 60_000;
const TOKEN_TTL_MS = 60_000;

/** A pack that can't be made, written for the person downloading. */
export class AuditPackRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuditPackRefusal";
  }
}

const TOO_LARGE =
  "This year's files are more than one ZIP can hold (3.5 GiB or 60,000 files). Contact the developer.";

export interface PackCounts {
  documentCount: number;
  fileCount: number;
  missingCount: number;
}

export type PreparedAuditPack = Awaited<ReturnType<typeof prepareAuditPack>>;

/**
 * Everything that can fail before a byte is sent: the workbook, the
 * documents, the size caps and a stat of every object. An object storage
 * doesn't hold becomes a Missing row. Stops when `signal` aborts.
 */
export async function prepareAuditPack(
  fiscalYearId: string,
  signal: AbortSignal
) {
  // The pack needs finance.view_sensitive, which may always see donors.
  const built = await buildCaWorkbook({ fiscalYearId, includeDonors: true });
  signal.throwIfAborted();
  const references = workbookDocumentReferences(
    built.sources.facts,
    built.sources.gifts
  );
  const [documents, trustName] = await Promise.all([
    loadPackDocuments(references, built.financialYear),
    loadTrustName(),
  ]);
  signal.throwIfAborted();
  const paths = new Map<string, string>();
  for (const d of documents) {
    for (const f of d.files) {
      if (f.objectKey && f.path) {
        paths.set(f.objectKey, f.path);
      }
    }
  }
  if (paths.size > MAX_FILES) {
    throw new AuditPackRefusal(TOO_LARGE);
  }
  const formulaSafeCsvKeys = new Set(
    documents.flatMap((document) =>
      document.files.flatMap((file) =>
        file.formulaSafeCsv && file.objectKey ? [file.objectKey] : []
      )
    )
  );
  const s3 = getS3();
  const sizes = new Map<string, number>();
  await mapWithConcurrency(
    [...paths.keys()],
    PREFLIGHT_CONCURRENCY,
    async (key) => {
      signal.throwIfAborted();
      const file = s3.file(key);
      // A failed stat is a missing object only when it doesn't exist.
      const stat = await file
        .stat()
        .catch(async (error: unknown) =>
          (await file.exists()) ? Promise.reject(error) : null
        );
      if (stat) {
        if (
          formulaSafeCsvKeys.has(key) &&
          !isSpreadsheetSafeCsv(await file.arrayBuffer())
        ) {
          throw new AuditPackRefusal(
            "A stored Form 113 upload file is unsafe to open. Contact the developer before downloading this audit pack."
          );
        }
        sizes.set(key, stat.size);
      }
    }
  );
  let totalBytes = 0;
  for (const size of sizes.values()) {
    totalBytes += size;
  }
  if (totalBytes > MAX_FILE_BYTES) {
    throw new AuditPackRefusal(TOO_LARGE);
  }
  // One stored object is one file however many rows list it; a record
  // naming no object is one missing file per document and label.
  const missing = new Set<string>();
  for (const d of documents) {
    for (const f of d.files) {
      if (f.url !== null || f.noFile) {
        continue;
      }
      if (!f.objectKey) {
        missing.add(`${d.reference}\u0000${f.label}`);
      } else if (!sizes.has(f.objectKey)) {
        missing.add(f.objectKey);
      }
    }
  }
  return {
    counts: {
      documentCount: documents.length,
      fileCount: sizes.size,
      missingCount: missing.size,
    } satisfies PackCounts,
    documents,
    files: [...paths].flatMap(([key, path]) => {
      const size = sizes.get(key);
      return size === undefined ? [] : [{ key, path, size }];
    }),
    financialYear: built.financialYear,
    fiscalYearId,
    trustName,
    workbook: {
      bytes: Buffer.from(built.file.base64, "base64"),
      filename: built.file.filename,
    },
  };
}

/** What the prepare's audit row records: counts as prepared, not as sent. */
export const preparedAuditMetadata = (pack: PreparedAuditPack) => ({
  financialYear: pack.financialYear,
  preparedDocumentCount: pack.counts.documentCount,
  preparedFileCount: pack.counts.fileCount,
  preparedMissingCount: pack.counts.missingCount,
});

const tokens = new Map<
  string,
  { expiresAt: number; pack: PreparedAuditPack; userId: string }
>();

function sweepExpiredTokens(now: number) {
  for (const [token, entry] of tokens) {
    if (entry.expiresAt <= now) {
      tokens.delete(token);
    }
  }
}

/**
 * A random, single-use token for the prepared pack. It is dropped at its
 * expiry even if never used, so an abandoned pack doesn't stay in memory.
 */
export function issueAuditPackToken(
  userId: string,
  pack: PreparedAuditPack
): string {
  const now = Date.now();
  sweepExpiredTokens(now);
  const token = randomBytes(32).toString("base64url");
  tokens.set(token, { expiresAt: now + TOKEN_TTL_MS, pack, userId });
  setTimeout(() => tokens.delete(token), TOKEN_TTL_MS).unref?.();
  return token;
}

/** The pack for a live token of this user; the token is spent either way. */
export function takeAuditPack(token: string, userId: string) {
  const now = Date.now();
  sweepExpiredTokens(now);
  const entry = tokens.get(token);
  tokens.delete(token);
  if (!entry || entry.userId !== userId) {
    return null;
  }
  return entry.pack;
}
