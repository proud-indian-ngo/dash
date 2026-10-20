import { createHash, randomBytes } from "node:crypto";

import { and, desc, eq, isNull, lte, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import { db } from "..";
import {
  governanceDocument,
  signingCertificate,
  trustee,
} from "../schema/governance";
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
  kind: "enrol" | "sign";
  resolutionId?: string | null;
  stateObjectKey?: string | null;
  toSign?: string | null;
  trusteeId: string;
  userId: string;
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
    createdAt: now,
    expiresAt: new Date(now.getTime() + SIGNING_JOB_TTL_MS),
    fieldName: input.fieldName ?? null,
    id,
    kind: input.kind,
    resolutionId: input.resolutionId ?? null,
    stateObjectKey: input.stateObjectKey ?? null,
    toSign: input.toSign ?? null,
    tokenHash: hashJobToken(token),
    trusteeId: input.trusteeId,
    userId: input.userId,
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
 * Marks a job finished, exactly once: a second post with the same token
 * finds nothing to update.
 */
export async function closeJob(
  id: string,
  outcome: { error: string } | { ok: true }
): Promise<boolean> {
  const updated = await db
    .update(signingJob)
    .set({
      completedAt: new Date(),
      error: "error" in outcome ? outcome.error : null,
      status: "error" in outcome ? "failed" : "completed",
    })
    .where(and(eq(signingJob.id, id), eq(signingJob.status, "pending")))
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

export async function setArchiveCopy(
  documentId: string,
  copy: { objectKey: string; renewOn: string; sha256: string }
): Promise<void> {
  await db
    .update(governanceDocument)
    .set({
      archiveObjectKey: copy.objectKey,
      archiveRenewOn: copy.renewOn,
      archiveSha256: copy.sha256,
      archivedAt: new Date(),
    })
    .where(eq(governanceDocument.id, documentId));
}

/** Archive copies whose yearly document timestamp is due. */
export async function archivesDue(today: string) {
  return await db
    .select({
      archiveObjectKey: governanceDocument.archiveObjectKey,
      id: governanceDocument.id,
    })
    .from(governanceDocument)
    .where(lte(governanceDocument.archiveRenewOn, today));
}
