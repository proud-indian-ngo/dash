import { db } from "@pi-dash/db";
import { getTrusteePrivate } from "@pi-dash/db/queries/governance";
import {
  currentRevision,
  getResolution,
  responseFor,
} from "@pi-dash/db/queries/resolutions";
import {
  esignByDocumentId,
  type EsignRequestRow,
  latestEsignFor,
  recordEsignRequest,
  settleEsign,
} from "@pi-dash/db/queries/signing";
import { user } from "@pi-dash/db/schema/auth";
import { trustee } from "@pi-dash/db/schema/governance";
import { eq } from "drizzle-orm";

import { runAuditedAction } from "../audit";
import { getS3 } from "../s3";
import { acceptSignedPdf } from "./accept-signature";
import { CircularError, circularReference } from "./circulars";
import {
  createEsignRequest,
  fetchSignedFile,
  leegalityConfig,
} from "./leegality";

/**
 * Aadhaar eSign for a circular: the trustee signs the latest PDF in
 * Leegality, and the copy Leegality returns must be that PDF with exactly
 * one more signature, theirs, like any other signed copy. If Leegality
 * rewrote the file instead, the earlier trustees' signatures wouldn't
 * survive, so it is refused with that reason.
 */

/** Ten digits, as Leegality wants an Indian mobile number. */
export function leegalityPhone(phone: string | null): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) {
    return digits.slice(2);
  }
  return digits.length === 10 ? digits : null;
}

export async function startEsign(input: {
  resolutionId: string;
  trustee: { id: string; legalName: string };
  userId: string;
}): Promise<{ signUrl: string }> {
  const config = leegalityConfig();
  if (!config) {
    throw new CircularError("Aadhaar eSign isn't set up yet.");
  }
  const [response, revision, row, details, account] = await Promise.all([
    responseFor(input.resolutionId, input.trustee.id),
    currentRevision(input.resolutionId),
    getResolution(input.resolutionId),
    getTrusteePrivate(input.trustee.id),
    db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, input.userId))
      .limit(1),
  ]);
  if (!(response && revision && row)) {
    throw new CircularError(
      "You weren't a trustee in office when this was issued."
    );
  }
  if (row.status !== "issued") {
    throw new CircularError("This circular is no longer open for signing.");
  }
  if (response.response !== "pending" || response.conflictDeclared) {
    throw new CircularError("You have already responded.");
  }
  const s3 = await getS3();
  const pdf = new Uint8Array(
    await s3.file(revision.latestObjectKey).arrayBuffer()
  );
  const reference = circularReference(input.resolutionId);
  const created = await createEsignRequest(
    {
      fileName: `Circular ${reference}.pdf`,
      irn: `${reference}-${input.trustee.id.slice(-8)}`,
      pdf,
      signer: {
        aadhaarLast4: details?.aadhaarLast4 ?? null,
        email: details?.email ?? account[0]?.email ?? null,
        name: details?.aadhaarName ?? input.trustee.legalName,
        phone: leegalityPhone(details?.phone ?? null),
      },
    },
    config
  );
  await recordEsignRequest({
    basedOnSha256: revision.latestSha256,
    providerDocumentId: created.documentId,
    resolutionId: input.resolutionId,
    trusteeId: input.trustee.id,
    userId: input.userId,
  });
  return { signUrl: created.signUrl };
}

export type EsignOutcome =
  | { status: "pending" }
  | { message: string; status: "failed" }
  | { number: string | null; resolutionStatus: string; status: "signed" };

function isPrefixOf(current: Uint8Array, signed: Uint8Array): boolean {
  if (signed.byteLength <= current.byteLength) {
    return false;
  }
  for (let i = 0; i < current.byteLength; i++) {
    if (signed[i] !== current[i]) {
      return false;
    }
  }
  return true;
}

/**
 * Brings back a pending eSign: still waiting, ended (expired or declined in
 * Leegality), or signed, in which case the signature is checked and
 * recorded. Settles the request once, so a repeated webhook is harmless.
 */
export async function completeEsign(
  request: EsignRequestRow
): Promise<EsignOutcome> {
  if (request.status !== "pending") {
    return request.status === "completed"
      ? { number: null, resolutionStatus: "", status: "signed" }
      : {
          message: request.error ?? "This eSign didn't go through.",
          status: "failed",
        };
  }
  const config = leegalityConfig();
  if (!config) {
    throw new CircularError("Aadhaar eSign isn't set up.");
  }
  const fail = async (message: string): Promise<EsignOutcome> => {
    await settleEsign(request.id, { error: message });
    return { message, status: "failed" };
  };
  const signed = await fetchSignedFile(request.providerDocumentId, config);
  if (signed.kind === "pending") {
    return { status: "pending" };
  }
  if (signed.kind === "ended") {
    return await fail(
      signed.reason === "expired"
        ? "The Leegality link expired before you signed. Start again."
        : "You declined to sign in Leegality."
    );
  }
  const revision = await currentRevision(request.resolutionId);
  if (!revision || revision.latestSha256 !== request.basedOnSha256) {
    return await fail(
      "Another trustee signed while you were in Leegality. Start again to sign the latest copy."
    );
  }
  const s3 = await getS3();
  const current = new Uint8Array(
    await s3.file(revision.latestObjectKey).arrayBuffer()
  );
  if (!isPrefixOf(current, signed.bytes)) {
    return await fail(
      "Leegality returned a rewritten PDF rather than adding your signature to it, so the other trustees' signatures wouldn't survive. Sign with your DSC or in Acrobat instead."
    );
  }
  const [row] = await db
    .select({ id: trustee.id, legalName: trustee.legalName })
    .from(trustee)
    .where(eq(trustee.id, request.trusteeId))
    .limit(1);
  if (!row) {
    return await fail("The trustee is no longer on the register.");
  }
  try {
    const decision = await acceptSignedPdf({
      method: "esign",
      resolutionId: request.resolutionId,
      trustee: row,
      uploaded: signed.bytes,
      userId: request.userId,
    });
    await settleEsign(request.id, { status: "completed" });
    return {
      number: decision.number,
      resolutionStatus: decision.status,
      status: "signed",
    };
  } catch (error) {
    if (error instanceof CircularError) {
      return await fail(error.message);
    }
    throw error;
  }
}

/** The trustee's latest eSign on a circular, for the page. */
export async function esignStatusFor(resolutionId: string, trusteeId: string) {
  const row = await latestEsignFor(resolutionId, trusteeId);
  return row
    ? {
        error: row.error,
        startedAt: row.createdAt.toISOString(),
        status: row.status,
      }
    : null;
}

export type WebhookReply = { body: Record<string, string>; status: number };

/**
 * A verified Leegality webhook for a document we sent. Brings the eSign
 * back like `checkEsignFn` does, audited as the trustee who started it.
 * Unknown documents are acknowledged and ignored; Leegality retries a
 * failed delivery, and a settled request ignores repeats.
 */
export async function completeEsignFromWebhook(
  documentId: string
): Promise<WebhookReply> {
  const request = await esignByDocumentId(documentId);
  if (!request) {
    return { body: { result: "ignored" }, status: 200 };
  }
  const [account] = await db
    .select({ name: user.name, role: user.role })
    .from(user)
    .where(eq(user.id, request.userId))
    .limit(1);
  const outcome = await runAuditedAction(
    {
      action: "resolution.sign",
      actor: {
        name: account?.name ?? "Trustee",
        role: account?.role ?? "unknown",
        userId: request.userId,
      },
      metadata: { method: "esign" },
      target: { id: request.resolutionId, type: "resolution" },
    },
    () => completeEsign(request),
    (result) => (result.status === "failed" ? "failure" : "success")
  );
  return { body: { result: outcome.status }, status: 200 };
}
