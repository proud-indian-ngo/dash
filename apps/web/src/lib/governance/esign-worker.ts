import {
  openEsignCircularIds,
  openEsignDocuments,
  unclosedDecidedEsignCircularIds,
} from "@pi-dash/db/queries/esign";
import { MeetingError } from "@pi-dash/db/queries/meetings";
import { DeclarationError } from "@pi-dash/db/queries/policies";
import { getCircular, ResolutionError } from "@pi-dash/db/queries/resolutions";
import { CertificateError } from "@pi-dash/db/queries/utilisation-certificates";
import type { getBossInstance } from "@pi-dash/jobs/boss-instance";
import { withDefaultOutput } from "@pi-dash/jobs/handlers/create-handler";
import { closeDueCircular } from "@pi-dash/jobs/handlers/resolutions";
import { todayInKolkata } from "@pi-dash/shared/income";
import { esignLapsed } from "@pi-dash/shared/resolutions";
import { createRequestLogger } from "evlog";

import { CircularError } from "./circulars";
import {
  closeEsignDocument,
  collectEsignatures,
  dropEsignDocument,
} from "./esign";
import {
  collectCertificateEsign,
  collectDeclarationEsign,
  collectMinutesEsign,
} from "./esign-documents";
import { LeegalityError } from "./leegality";
import { SigningServiceError } from "./signing-service";

/**
 * Server-only. The `collect-esign-signatures` worker: every open Aadhaar
 * eSign circular's new signatures, for trustees who signed on Leegality and
 * didn't come back, then the ones past their response date are decided
 * (the close-due job leaves them to it, so eSigns made by the date count),
 * and decided ones whose Leegality document is still there are closed;
 * then every open minutes, declaration or utilisation certificate eSign. It
 * lives in the web app, which holds the Leegality and signing clients; the
 * queue is created with the others. Logs carry IDs and counts only.
 */

const QUEUE = "collect-esign-signatures";
const REGISTERED_KEY = "__esign_worker_registered__";

type Boss = NonNullable<ReturnType<typeof getBossInstance>>;

/** A refusal someone has to act on, not a fault in the code. */
function expected(error: unknown): boolean {
  if (
    error instanceof ResolutionError ||
    error instanceof MeetingError ||
    error instanceof DeclarationError ||
    error instanceof CertificateError
  ) {
    return true;
  }
  return (
    (error instanceof CircularError ||
      error instanceof LeegalityError ||
      error instanceof SigningServiceError) &&
    !error.fault
  );
}

export async function collectOpenEsignatures(
  today: string = todayInKolkata()
): Promise<{
  checked: number;
  closed: number;
  failed: number;
  recorded: number;
}> {
  const ids = await openEsignCircularIds();
  let recorded = 0;
  let failed = 0;
  let closed = 0;
  // One at a time, each on its own: one circular's refusal leaves the others.
  for (const circularId of ids) {
    const log = createRequestLogger({ method: "JOB", path: QUEUE });
    log.set({ circularId });
    try {
      const taken = await collectEsignatures(circularId);
      recorded += taken.length;
      log.set({ event: "esign_collected", recorded: taken.length });
    } catch (error) {
      failed += 1;
      log.set({
        errorName: error instanceof Error ? error.name : "unknown",
        event: "esign_collect_failed",
      });
      if (expected(error)) {
        log.warn("esign signatures not taken");
      } else {
        log.error(error instanceof Error ? error : String(error));
      }
    }
    // Past its date, a circular is decided even when an eSign couldn't be
    // taken, so a refusal can't hold it open.
    const row = await getCircular(circularId);
    if (row && row.responseDueOn < today) {
      const decisions = await closeDueCircular(circularId, today);
      closed += decisions.filter((d) => d.status !== "issued").length;
    }
    log.emit();
  }
  for (const circularId of await unclosedDecidedEsignCircularIds()) {
    await closeEsignDocument(circularId);
  }
  // Minutes, declarations and utilisation certificates: each takes its
  // eSigns, or closes its Leegality document once done with; one lapsed
  // unsigned is withdrawn after a last check.
  const docs = await openEsignDocuments();
  for (const doc of docs) {
    const log = createRequestLogger({ method: "JOB", path: QUEUE });
    log.set({ esignDocumentId: doc.id });
    try {
      if (doc.meetingId) {
        const found = await collectMinutesEsign(doc.meetingId);
        recorded += found === "recorded" ? 1 : 0;
      } else if (doc.declarationId) {
        const found = await collectDeclarationEsign(doc.declarationId);
        recorded += found === "recorded" ? 1 : 0;
      } else if (doc.certificateId) {
        recorded += await collectCertificateEsign(doc.certificateId);
      }
    } catch (error) {
      failed += 1;
      log.set({
        errorName: error instanceof Error ? error.name : "unknown",
        event: "esign_collect_failed",
      });
      if (expected(error)) {
        log.warn("esign signatures not taken");
      } else {
        log.error(error instanceof Error ? error : String(error));
      }
    }
    // Even when the last check is refused, so a lapsed one isn't polled forever.
    if (esignLapsed(doc.createdAt)) {
      await dropEsignDocument(doc);
      log.set({ lapsed: true });
    }
    log.emit();
  }
  return { checked: ids.length + docs.length, closed, failed, recorded };
}

export async function registerEsignWorker(boss: Boss): Promise<void> {
  const flags = globalThis as Record<string, unknown>;
  if (flags[REGISTERED_KEY]) {
    return;
  }
  flags[REGISTERED_KEY] = true;
  await boss.work<Record<string, never>>(
    QUEUE,
    { pollingIntervalSeconds: 30 },
    (jobs) =>
      withDefaultOutput<Record<string, never>>(() => collectOpenEsignatures())(
        jobs
      )
  );
}
