import { createHash, randomBytes } from "node:crypto";

import {
  and,
  desc,
  eq,
  gte,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import { db } from "..";
import {
  circularSignature,
  governanceDocument,
  signingCertificate,
  trustee,
} from "../schema/governance";
import { utilisationCertificate } from "../schema/grant";
import { signingJob } from "../schema/private/trustee-private";

/** A signing link lives this long. */
export const SIGNING_JOB_TTL_MS = 15 * 60 * 1000;

export function hashJobToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** A one-time job token: 32 random bytes, URL-safe. */
export function newJobToken(): string {
  return randomBytes(32).toString("base64url");
}

export interface NewSigningJob {
  basedOnSha256?: string | null;
  certificateId?: string | null;
  fieldName?: string | null;
  circularId?: string | null;
  declarationId?: string | null;
  kind: "enrol" | "sign";
  meetingId?: string | null;
  stateObjectKey?: string | null;
  toSign?: string | null;
  trusteeId: string;
  userId: string;
  utilisationCertificateId?: string | null;
}

/** Creates a job and returns its id and the token, which is never stored. */
export async function createSigningJob(
  input: NewSigningJob,
  now: Date = new Date()
): Promise<{ id: string; token: string }> {
  const token = newJobToken();
  const id = uuidv7();
  await db.insert(signingJob).values({
    basedOnSha256: input.basedOnSha256 ?? null,
    certificateId: input.certificateId ?? null,
    circularId: input.circularId ?? null,
    createdAt: now,
    declarationId: input.declarationId ?? null,
    expiresAt: new Date(now.getTime() + SIGNING_JOB_TTL_MS),
    fieldName: input.fieldName ?? null,
    id,
    kind: input.kind,
    meetingId: input.meetingId ?? null,
    stateObjectKey: input.stateObjectKey ?? null,
    toSign: input.toSign ?? null,
    tokenHash: hashJobToken(token),
    trusteeId: input.trusteeId,
    userId: input.userId,
    utilisationCertificateId: input.utilisationCertificateId ?? null,
  });
  return { id, token };
}

export type SigningJobRow = typeof signingJob.$inferSelect;

/** A pending, unexpired job for a token, with the trustee's name. */
export async function openJobForToken(
  token: string,
  now: Date = new Date()
): Promise<(SigningJobRow & { legalName: string }) | null> {
  const [row] = await db
    .select({ job: signingJob, legalName: trustee.legalName })
    .from(signingJob)
    .innerJoin(trustee, eq(trustee.id, signingJob.trusteeId))
    .where(eq(signingJob.tokenHash, hashJobToken(token)))
    .limit(1);
  if (!row) {
    return null;
  }
  if (row.job.status !== "pending" || row.job.expiresAt <= now) {
    return null;
  }
  return { ...row.job, legalName: row.legalName };
}

/**
 * A completion's claim on a pending job lapses after this, so one that died
 * mid-way doesn't hold it forever. Longer than any completion takes.
 */
export const SETTLING_CLAIM_MS = 5 * 60 * 1000;

/**
 * Runs `work` while claiming one pending job, so a second completion racing
 * the first (a repeated post) gets `null` straight away instead of running
 * too. The claim is the pending row's `completedAt`, committed before
 * `work` runs, so no connection is held meanwhile. `work` gets the claim
 * and settles the row with it (`closeJob`), so a completion whose claim
 * lapsed and was taken over can't settle it too; `work` that leaves the row
 * pending gives it back.
 */
export async function whileClaimed<T>(
  id: string,
  work: (claim: Date) => Promise<T>
): Promise<T | null> {
  const claim = new Date();
  const claimed = await db
    .update(signingJob)
    .set({ completedAt: claim })
    .where(
      and(
        eq(signingJob.id, id),
        eq(signingJob.status, "pending"),
        or(
          isNull(signingJob.completedAt),
          lte(
            signingJob.completedAt,
            new Date(claim.getTime() - SETTLING_CLAIM_MS)
          )
        )
      )
    )
    .returning({ id: signingJob.id });
  if (claimed.length === 0) {
    return null;
  }
  try {
    return await work(claim);
  } finally {
    await db
      .update(signingJob)
      .set({ completedAt: null })
      .where(
        and(
          eq(signingJob.id, id),
          eq(signingJob.status, "pending"),
          eq(signingJob.completedAt, claim)
        )
      );
  }
}

/** How a job ended, read fresh. */
export async function jobOutcome(id: string) {
  const [row] = await db
    .select({ error: signingJob.error, status: signingJob.status })
    .from(signingJob)
    .where(eq(signingJob.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * Marks a job finished, exactly once and only by the completion holding
 * `claim`: one whose claim was taken over finds nothing to update.
 */
export async function closeJob(
  id: string,
  claim: Date,
  outcome: { error: string } | { ok: true }
): Promise<boolean> {
  const updated = await db
    .update(signingJob)
    .set({
      completedAt: new Date(),
      error: "error" in outcome ? outcome.error : null,
      status: "error" in outcome ? "failed" : "completed",
    })
    .where(
      and(
        eq(signingJob.id, id),
        eq(signingJob.status, "pending"),
        eq(signingJob.completedAt, claim)
      )
    )
    .returning({ id: signingJob.id });
  return updated.length === 1;
}

/** What the person's page polls for: their own job only. */
export async function jobStatusFor(id: string, userId: string) {
  const [row] = await db
    .select({
      error: signingJob.error,
      expiresAt: signingJob.expiresAt,
      status: signingJob.status,
    })
    .from(signingJob)
    .where(and(eq(signingJob.id, id), eq(signingJob.userId, userId)))
    .limit(1);
  if (!row) {
    return null;
  }
  const expired = row.status === "pending" && row.expiresAt <= new Date();
  return {
    error: expired ? "The link expired. Start again." : row.error,
    status: expired ? ("failed" as const) : row.status,
  };
}

/**
 * Whether the trustee's signature on the circular was recorded since a job
 * started: a completion whose claim lapsed may have recorded it
 * while another took over, which is that job done, not failed.
 */
export async function signatureRecordedSince(
  circularId: string,
  trusteeId: string,
  since: Date
): Promise<boolean> {
  const [row] = await db
    .select({ id: circularSignature.id })
    .from(circularSignature)
    .where(
      and(
        eq(circularSignature.circularId, circularId),
        eq(circularSignature.trusteeId, trusteeId),
        gte(circularSignature.createdAt, since)
      )
    )
    .limit(1);
  return row !== undefined;
}

// ── Certificates ────────────────────────────────────────────────────────────

export interface CertificateFacts {
  chain: string[];
  der: string;
  issuer: string;
  notAfter: Date;
  notBefore: Date;
  serial: string;
  sha256: string;
  subject: string;
}

/** Records a trustee's certificate; enrolling the same one again changes nothing. */
export async function enrolCertificate(
  trusteeId: string,
  facts: CertificateFacts
): Promise<string> {
  const [existing] = await db
    .select({ id: signingCertificate.id })
    .from(signingCertificate)
    .where(
      and(
        eq(signingCertificate.trusteeId, trusteeId),
        eq(signingCertificate.sha256, facts.sha256)
      )
    )
    .limit(1);
  if (existing) {
    await db
      .update(signingCertificate)
      .set({ chain: facts.chain, revokedAt: null })
      .where(eq(signingCertificate.id, existing.id));
    return existing.id;
  }
  const id = uuidv7();
  await db.insert(signingCertificate).values({
    chain: facts.chain,
    der: facts.der,
    enrolledAt: new Date(),
    id,
    issuer: facts.issuer,
    method: "dsc_helper",
    notAfter: facts.notAfter,
    notBefore: facts.notBefore,
    serial: facts.serial,
    sha256: facts.sha256,
    subject: facts.subject,
    trusteeId,
  });
  return id;
}

/** The trustee's newest certificate valid now, not revoked. */
export async function currentCertificate(
  trusteeId: string,
  now: Date = new Date()
) {
  const [row] = await db
    .select()
    .from(signingCertificate)
    .where(
      and(
        eq(signingCertificate.trusteeId, trusteeId),
        isNull(signingCertificate.revokedAt),
        lte(signingCertificate.notBefore, now),
        sql`${signingCertificate.notAfter} > ${now}`
      )
    )
    .orderBy(desc(signingCertificate.notAfter))
    .limit(1);
  return row ?? null;
}

export async function getCertificate(id: string) {
  const [row] = await db
    .select()
    .from(signingCertificate)
    .where(eq(signingCertificate.id, id))
    .limit(1);
  return row ?? null;
}

// ── Long-term copies ────────────────────────────────────────────────────────

/**
 * Where a long-term copy is recorded: a vault document, or a utilisation
 * certificate both trustees have signed, until it is filed in the vault.
 */
export type ArchiveTarget = { documentId: string } | { certificateId: string };

export async function setArchiveCopy(
  target: ArchiveTarget,
  copy: { objectKey: string; renewOn: string; sha256: string }
): Promise<void> {
  const values = {
    archiveObjectKey: copy.objectKey,
    archiveRenewOn: copy.renewOn,
    archiveSha256: copy.sha256,
    archivedAt: new Date(),
  };
  if ("documentId" in target) {
    await db
      .update(governanceDocument)
      .set(values)
      .where(eq(governanceDocument.id, target.documentId));
    return;
  }
  // Under the certificate's lock, which filing it in the vault takes too: a
  // copy made after the certificate was filed goes to its vault document.
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ documentId: utilisationCertificate.documentId })
      .from(utilisationCertificate)
      .where(eq(utilisationCertificate.id, target.certificateId))
      .for("update");
    if (row?.documentId) {
      await tx
        .update(governanceDocument)
        .set(values)
        .where(eq(governanceDocument.id, row.documentId));
      return;
    }
    await tx
      .update(utilisationCertificate)
      .set(values)
      .where(eq(utilisationCertificate.id, target.certificateId));
  });
}

/**
 * Long-term copies to make or renew: vault documents' whose yearly document
 * timestamp is due, and certificates both trustees signed whose copy is due
 * or was never made (a filed one's is its vault document's). A cancelled
 * certificate that was never filed is no longer kept up. `originalObjectKey`
 * is the signed PDF itself: a copy still at that key was never made.
 */
export async function archivesDue(today: string): Promise<
  {
    archiveObjectKey: string;
    originalObjectKey: string;
    target: ArchiveTarget;
  }[]
> {
  const [documents, certificates] = await Promise.all([
    db
      .select({
        archiveObjectKey: governanceDocument.archiveObjectKey,
        id: governanceDocument.id,
        objectKey: governanceDocument.objectKey,
      })
      .from(governanceDocument)
      .where(lte(governanceDocument.archiveRenewOn, today)),
    db
      .select({
        archiveObjectKey: utilisationCertificate.archiveObjectKey,
        id: utilisationCertificate.id,
        latestObjectKey: utilisationCertificate.latestObjectKey,
      })
      .from(utilisationCertificate)
      .leftJoin(
        governanceDocument,
        eq(governanceDocument.id, utilisationCertificate.documentId)
      )
      .where(
        or(
          and(
            isNull(utilisationCertificate.documentId),
            eq(utilisationCertificate.status, "awaiting_ca"),
            or(
              isNull(utilisationCertificate.archiveObjectKey),
              lte(utilisationCertificate.archiveRenewOn, today)
            )
          ),
          and(
            isNotNull(utilisationCertificate.documentId),
            isNull(governanceDocument.archiveObjectKey)
          )
        )
      ),
  ]);
  return [
    ...documents.map((d) => ({
      archiveObjectKey: d.archiveObjectKey ?? d.objectKey,
      originalObjectKey: d.objectKey,
      target: { documentId: d.id },
    })),
    ...certificates.map((c) => ({
      archiveObjectKey: c.archiveObjectKey ?? c.latestObjectKey,
      originalObjectKey: c.latestObjectKey,
      target: { certificateId: c.id },
    })),
  ];
}
