import { createHash } from "node:crypto";

import type { GovernanceValidationReport } from "@pi-dash/db/schema/governance";
import {
  GOVERNANCE_DOCUMENT_MAX_BYTES,
  type GovernanceDocumentFormat,
  type GovernanceDocumentKind,
  matchSignerToTrustee,
} from "@pi-dash/shared/governance";
import { uuidv7 } from "uuidv7";

import { HttpError } from "../http-error";
import { databaseErrorFields } from "../safe-errors";
import { assertOwnedTemporaryUploadKey } from "../temporary-upload";
import { readEmailEvidence } from "./eml";

/**
 * Bringing a file into the governance vault: the browser has uploaded it to
 * a temporary key; this checks what it really is, hashes it, has the signing
 * service check any signatures, matches signers to the register, copies it
 * to its permanent key and records it. The file never changes after this.
 */

export class VaultImportError extends Error {}

export type SniffedType = "pdf" | "jpeg" | "png" | "eml";

const CONTENT_TYPES: Record<SniffedType, string> = {
  eml: "message/rfc822",
  jpeg: "image/jpeg",
  png: "image/png",
  pdf: "application/pdf",
};

const HEADER_LINE = /^[A-Za-z0-9-]+:/;
const FROM_OR_DATE = /^(?:From|Date):/im;

/** What a file is from its first bytes, regardless of its name or declared type. */
export function sniffType(bytes: Uint8Array): SniffedType | null {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
  if (head.startsWith("%PDF-")) {
    return "pdf";
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  if (head.startsWith("\x89PNG\r\n\x1a\n")) {
    return "png";
  }
  // An email starts with header lines such as "Received:" or "From:".
  if (HEADER_LINE.test(head) && FROM_OR_DATE.test(head)) {
    return "eml";
  }
  return null;
}

const ACCEPTS: Record<GovernanceDocumentFormat, readonly SniffedType[]> = {
  eml: ["eml"],
  pdf: ["pdf"],
  scan: ["pdf", "jpeg", "png"],
  signed_pdf: ["pdf"],
};

const FORMAT_WORDS: Record<GovernanceDocumentFormat, string> = {
  eml: "an email saved as .eml",
  pdf: "a PDF",
  scan: "a PDF, JPEG or PNG",
  signed_pdf: "a PDF",
};

export interface VaultImportInput {
  datedOn: string;
  fileName: string;
  keyPrefix: string;
  kind: GovernanceDocumentKind;
  note: string | null;
  sourceFormat: GovernanceDocumentFormat;
  tempKey: string;
  title: string;
  userId: string;
}

export interface VaultImportDeps {
  deleteObject: (key: string) => Promise<void>;
  findBySha256: (
    sha256: string
  ) => Promise<{ id: string; title: string } | null>;
  insert: (row: {
    contentType: string;
    datedOn: string;
    id: string;
    kind: GovernanceDocumentKind;
    note: string | null;
    objectKey: string;
    originalFilename: string;
    sha256: string;
    sizeBytes: number;
    sourceFormat: GovernanceDocumentFormat;
    title: string;
    uploadedBy: string;
    validationReport: GovernanceValidationReport | null;
  }) => Promise<string>;
  readObject: (key: string) => Promise<Uint8Array | null>;
  trusteeNames: () => Promise<{ id: string; names: string[] }[]>;
  validatePdf: (bytes: Uint8Array) => Promise<GovernanceValidationReport>;
  writeObject: (key: string, bytes: Uint8Array, type: string) => Promise<void>;
}

export interface VaultImportResult {
  id: string;
  report: GovernanceValidationReport | null;
  sourceFormat: GovernanceDocumentFormat;
}

/** A file name safe inside an object key and a Content-Disposition header. */
export function safeFileName(name: string): string {
  const cleaned = name
    .trim()
    .replaceAll(/[\r\n"\\/]/g, "")
    .replaceAll(/\s+/g, "-")
    .replaceAll(/[^A-Za-z0-9._-]/g, "")
    .slice(-120);
  return cleaned || "document";
}

/** The report with each signer matched to the trustee register, where one matches. */
export async function matchReportSigners(
  report: GovernanceValidationReport,
  trusteeNames: () => Promise<{ id: string; names: string[] }[]>
): Promise<GovernanceValidationReport> {
  if (report.signatures.length === 0) {
    return report;
  }
  const trustees = await trusteeNames();
  return {
    ...report,
    signatures: report.signatures.map((signature) => ({
      ...signature,
      matchedTrusteeId: matchSignerToTrustee(signature.signerName, trustees),
    })),
  };
}

async function reportFor(
  type: SniffedType,
  sourceFormat: GovernanceDocumentFormat,
  bytes: Uint8Array,
  deps: VaultImportDeps
): Promise<{
  report: GovernanceValidationReport | null;
  sourceFormat: GovernanceDocumentFormat;
}> {
  if (type === "eml") {
    const email = readEmailEvidence(bytes);
    if (!email) {
      throw new VaultImportError("The email's headers couldn't be read.");
    }
    return {
      report: {
        checkedAt: new Date().toISOString(),
        email,
        signatures: [],
        status: "no_signatures",
      },
      sourceFormat,
    };
  }
  if (type !== "pdf") {
    return { report: null, sourceFormat };
  }
  const report = await deps.validatePdf(bytes);
  if (report.status === "no_signatures" && sourceFormat === "signed_pdf") {
    throw new VaultImportError(
      "This PDF has no digital signatures. Upload it as a PDF or a scan instead."
    );
  }
  const hasSignatures = report.signatures.length > 0;
  const matched = await matchReportSigners(report, deps.trusteeNames);
  // A PDF that turns out to carry signatures is recorded as signed; a scan stays a scan.
  return {
    report: matched,
    sourceFormat:
      hasSignatures && sourceFormat === "pdf" ? "signed_pdf" : sourceFormat,
  };
}

export async function importVaultDocument(
  input: VaultImportInput,
  deps: VaultImportDeps
): Promise<VaultImportResult> {
  const tempKey = assertOwnedTemporaryUploadKey(input.tempKey, {
    keyPrefix: input.keyPrefix,
    userId: input.userId,
  });
  if (!tempKey.startsWith(`${input.keyPrefix}/governance/tmp/`)) {
    throw new HttpError(403, "Forbidden");
  }
  const bytes = await deps.readObject(tempKey);
  if (!bytes) {
    throw new VaultImportError(
      "The upload wasn't found. Upload the file again."
    );
  }
  if (bytes.byteLength === 0) {
    throw new VaultImportError("The file is empty.");
  }
  if (bytes.byteLength > GOVERNANCE_DOCUMENT_MAX_BYTES) {
    throw new VaultImportError("The file is larger than 25 MB.");
  }
  const type = sniffType(bytes);
  if (!(type && ACCEPTS[input.sourceFormat].includes(type))) {
    throw new VaultImportError(
      `That file isn't ${FORMAT_WORDS[input.sourceFormat]}.`
    );
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const duplicate = await deps.findBySha256(sha256);
  if (duplicate) {
    throw new VaultImportError(
      `This file is already in the vault as "${duplicate.title}".`
    );
  }

  const { report, sourceFormat } = await reportFor(
    type,
    input.sourceFormat,
    bytes,
    deps
  );

  const id = uuidv7();
  const fileName = safeFileName(input.fileName);
  const objectKey = `${input.keyPrefix}/governance/documents/${id}/${fileName}`;
  const contentType = CONTENT_TYPES[type];
  await deps.writeObject(objectKey, bytes, contentType);
  try {
    await deps.insert({
      contentType,
      datedOn: input.datedOn,
      id,
      kind: input.kind,
      note: input.note,
      objectKey,
      originalFilename: input.fileName.slice(0, 200),
      sha256,
      sizeBytes: bytes.byteLength,
      sourceFormat,
      title: input.title,
      uploadedBy: input.userId,
      validationReport: report,
    });
  } catch (error) {
    await deps.deleteObject(objectKey).catch(() => undefined);
    // The same file uploaded at the same moment: the other copy won.
    const raced =
      databaseErrorFields(error).constraint ===
      "governance_document_sha256_uidx"
        ? await deps.findBySha256(sha256)
        : null;
    if (raced) {
      throw new VaultImportError(
        `This file is already in the vault as "${raced.title}".`
      );
    }
    throw error;
  }
  await deps.deleteObject(tempKey).catch(() => undefined);
  return { id, report, sourceFormat };
}
