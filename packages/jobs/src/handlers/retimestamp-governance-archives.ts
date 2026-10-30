import { createHash } from "node:crypto";

import { isEsignVaultDocument } from "@pi-dash/db/queries/esign";
import {
  type ArchiveTarget,
  archivesDue,
  setArchiveCopy,
} from "@pi-dash/db/queries/signing";
import {
  fileFinalCertificate,
  unfiledFinalCertificates,
} from "@pi-dash/db/queries/utilisation-certificates";
import type { GovernanceValidationReport } from "@pi-dash/db/schema/governance";
import { env } from "@pi-dash/env/server";
import { addDays } from "@pi-dash/shared/governance";
import { todayInKolkata } from "@pi-dash/shared/income";
import { createRequestLogger } from "evlog";
import type { Job } from "pg-boss";

import { getR2Client } from "./r2";

const RENEW_DAYS = 365;

export interface RetimestampResult {
  due: number;
  failed: number;
  filed: number;
  renewed: number;
}

interface ArchiveStep {
  /** An Aadhaar eSign circular's copy: through the signing plugin's routes. */
  esign: boolean;
}

interface RetimestampDeps {
  /** Revocation data and a first document timestamp: a copy never made. */
  finalize: (pdf: Uint8Array, step: ArchiveStep) => Promise<Uint8Array>;
  /** Whether the copy is an Aadhaar eSign circular's (`isEsignVaultDocument`). */
  isEsign: (target: ArchiveTarget) => Promise<boolean>;
  read: (key: string) => Promise<Uint8Array>;
  /** A new document timestamp on an existing long-term copy. */
  retimestamp: (pdf: Uint8Array, step: ArchiveStep) => Promise<Uint8Array>;
  validate: (pdf: Uint8Array) => Promise<GovernanceValidationReport>;
  write: (key: string, bytes: Uint8Array) => Promise<void>;
}

async function postToSigningService(
  path: string,
  pdf: Uint8Array
): Promise<Response> {
  if (!(env.SIGNING_SERVICE_URL && env.SIGNING_SERVICE_TOKEN)) {
    throw new Error("signing_service_not_configured");
  }
  const response = await fetch(new URL(path, env.SIGNING_SERVICE_URL), {
    body: new Blob([new Uint8Array(pdf)], { type: "application/pdf" }),
    headers: {
      Authorization: `Bearer ${env.SIGNING_SERVICE_TOKEN}`,
      "Content-Type": "application/pdf",
    },
    method: "POST",
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    throw new Error(`signing_service_${response.status}`);
  }
  return response;
}

const pdfFrom = async (response: Promise<Response>) =>
  new Uint8Array(await (await response).arrayBuffer());

function defaultDeps(): RetimestampDeps {
  const r2 = getR2Client();
  return {
    // KeySeal's strict reader can't open Leegality's files, so an eSign
    // circular's copy goes through the plugin's routes.
    finalize: (pdf, { esign }) =>
      pdfFrom(
        postToSigningService(
          esign ? "/pidash/finalize-esign" : "/finalize",
          pdf
        )
      ),
    isEsign: async (target) =>
      "documentId" in target && (await isEsignVaultDocument(target.documentId)),
    read: async (key) => new Uint8Array(await r2.file(key).arrayBuffer()),
    retimestamp: (pdf, { esign }) =>
      pdfFrom(
        postToSigningService(
          esign ? "/pidash/retimestamp-esign" : "/retimestamp",
          pdf
        )
      ),
    validate: async (pdf) =>
      (await (
        await postToSigningService("/validate", pdf)
      ).json()) as GovernanceValidationReport,
    write: async (key, bytes) => {
      await r2.write(key, bytes, { type: "application/pdf" });
    },
  };
}

/** The renewed copy's key: next to the old one, dated, so no copy is overwritten. */
export function renewedKey(previous: string, today: string): string {
  const base = previous.replace(/(-\d{4}-\d{2}-\d{2})?\.pdf$/, "");
  return `${base}-${today}.pdf`;
}

/** One line per row that failed or was skipped, so failures don't overwrite each other. */
function logRow(fields: Record<string, string>, error?: unknown): void {
  const log = createRequestLogger({
    method: "JOB",
    path: "retimestamp-governance-archives",
  });
  log.set({
    event: error ? "governance_archive_failed" : "governance_archive_skipped",
    ...fields,
  });
  if (error) {
    log.error(error instanceof Error ? error : String(error));
  }
  log.emit();
}

/**
 * Monthly: files any final utilisation certificate not yet in the vault
 * (made final before filing existed), then every long-term copy that is due
 * gets its next document timestamp, with revocation data for the last one,
 * before that timestamp's certificate expires. A copy never made (its
 * making failed, or it predates long-term copies) is made instead, with
 * revocation data for every signature. A failed one stays due and is
 * retried at the next run. Logs counts only.
 */
export async function handleRetimestampGovernanceArchives(
  _jobs: Job[],
  today: string = todayInKolkata(),
  deps: RetimestampDeps = defaultDeps()
): Promise<RetimestampResult> {
  const log = createRequestLogger({
    method: "JOB",
    path: "retimestamp-governance-archives",
  });
  let filed = 0;
  let failed = 0;
  for (const certificate of await unfiledFinalCertificates()) {
    try {
      const bytes = await deps.read(certificate.latestObjectKey);
      const outcome = await fileFinalCertificate(certificate.id, {
        report: await deps.validate(bytes),
        sha256: createHash("sha256").update(bytes).digest("hex"),
        sizeBytes: bytes.byteLength,
      });
      if (outcome === "filed") {
        filed += 1;
      } else {
        logRow({ certificateId: certificate.id, skipped: outcome });
      }
    } catch (error) {
      failed += 1;
      logRow({ certificateId: certificate.id }, error);
    }
  }
  const due = await archivesDue(today);
  let renewed = 0;
  for (const copy of due) {
    try {
      const current = await deps.read(copy.archiveObjectKey);
      const step = { esign: await deps.isEsign(copy.target) };
      const next = copy.neverMade
        ? await deps.finalize(current, step)
        : await deps.retimestamp(current, step);
      const key = renewedKey(copy.archiveObjectKey, today);
      await deps.write(key, next);
      await setArchiveCopy(copy.target, {
        objectKey: key,
        renewOn: addDays(today, RENEW_DAYS),
        sha256: createHash("sha256").update(next).digest("hex"),
      });
      renewed += 1;
    } catch (error) {
      failed += 1;
      logRow({ ...copy.target }, error);
    }
  }
  log.set({
    due: due.length,
    event: "governance_archives_renewed",
    failed,
    filed,
    renewed,
  });
  log.emit();
  return { due: due.length, failed, filed, renewed };
}
