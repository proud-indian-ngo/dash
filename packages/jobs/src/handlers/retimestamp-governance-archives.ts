import { createHash } from "node:crypto";

import { archivesDue, setArchiveCopy } from "@pi-dash/db/queries/signing";
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
  renewed: number;
}

interface RetimestampDeps {
  read: (key: string) => Promise<Uint8Array>;
  retimestamp: (pdf: Uint8Array) => Promise<Uint8Array>;
  write: (key: string, bytes: Uint8Array) => Promise<void>;
}

async function postToSigningService(
  path: string,
  pdf: Uint8Array
): Promise<Uint8Array> {
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
  return new Uint8Array(await response.arrayBuffer());
}

function defaultDeps(): RetimestampDeps {
  const r2 = getR2Client();
  return {
    read: async (key) => new Uint8Array(await r2.file(key).arrayBuffer()),
    retimestamp: (pdf) => postToSigningService("/retimestamp", pdf),
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

/**
 * Monthly: every long-term copy whose yearly renewal is due gets revocation
 * data for its last timestamp and a new document timestamp, before the last
 * timestamp's certificate expires. A failed one stays due and is retried at
 * the next run. Logs counts only.
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
  const due = await archivesDue(today);
  let renewed = 0;
  let failed = 0;
  for (const document of due) {
    if (!document.archiveObjectKey) {
      continue;
    }
    try {
      const current = await deps.read(document.archiveObjectKey);
      const next = await deps.retimestamp(current);
      const key = renewedKey(document.archiveObjectKey, today);
      await deps.write(key, next);
      await setArchiveCopy(document.id, {
        objectKey: key,
        renewOn: addDays(today, RENEW_DAYS),
        sha256: createHash("sha256").update(next).digest("hex"),
      });
      renewed += 1;
    } catch (error) {
      failed += 1;
      log.set({ failedDocumentId: document.id });
      log.error(error instanceof Error ? error : String(error));
    }
  }
  log.set({
    due: due.length,
    event: "governance_archives_renewed",
    failed,
    renewed,
  });
  log.emit();
  return { due: due.length, failed, renewed };
}
