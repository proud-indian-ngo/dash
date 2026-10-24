import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
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
} from "../schema/governance";
import { utilisationCertificate } from "../schema/grant";
import { signingJob } from "../schema/private/trustee-private";

/**
 * A signr job as `@signr/server`'s adapter sees it: `id` is the SHA-256 of
 * the job token, which the row keeps as `token_hash` beside its own UUIDv7.
 */
export type SigningJob = Omit<
  typeof signingJob.$inferSelect,
  "id" | "tokenHash"
> & { id: string };

type SigningJobPatch = Partial<Omit<SigningJob, "createdAt" | "id" | "kind">>;

function toSigningJob({
  tokenHash,
  ...row
}: typeof signingJob.$inferSelect): SigningJob {
  return { ...row, id: tokenHash };
}

export async function insertSigningJob({
  id,
  ...job
}: SigningJob): Promise<void> {
  await db.insert(signingJob).values({ ...job, id: uuidv7(), tokenHash: id });
}

export async function getSigningJob(id: string): Promise<SigningJob | null> {
  const [row] = await db
    .select()
    .from(signingJob)
    .where(eq(signingJob.tokenHash, id))
    .limit(1);
  return row ? toSigningJob(row) : null;
}

/**
 * Applies `patch` only while the job is still in `expected`, state and
 * lease start, in one statement, so two requests can't both move it.
 */
export async function transitionSigningJob(
  id: string,
  expected: { leaseStartedAt: Date | null; state: SigningJob["state"] },
  patch: SigningJobPatch
): Promise<boolean> {
  const updated = await db
    .update(signingJob)
    .set(patch)
    .where(
      and(
        eq(signingJob.tokenHash, id),
        eq(signingJob.state, expected.state),
        expected.leaseStartedAt === null
          ? isNull(signingJob.leaseStartedAt)
          : eq(signingJob.leaseStartedAt, expected.leaseStartedAt)
      )
    )
    .returning({ id: signingJob.id });
  return updated.length === 1;
}

/**
 * Expires every open job created before `cutoff`, except one whose settle
 * lease started at or after `leaseCutoff`, which may still finish. Returns
 * the jobs as they were, so their blobs can be deleted.
 */
export async function expireSigningJobs(
  cutoff: Date,
  leaseCutoff: Date
): Promise<SigningJob[]> {
  const open = inArray(signingJob.state, ["pending", "claimed", "prepared"]);
  return await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(signingJob)
      .where(
        and(
          open,
          lt(signingJob.createdAt, cutoff),
          or(
            isNull(signingJob.leaseStartedAt),
            lt(signingJob.leaseStartedAt, leaseCutoff)
          )
        )
      )
      .for("update", { skipLocked: true });
    if (rows.length === 0) {
      return [];
    }
    await tx
      .update(signingJob)
      .set({ state: "expired" })
      .where(
        inArray(
          signingJob.id,
          rows.map((row) => row.id)
        )
      );
    return rows.map(toSigningJob);
  });
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
 * certificate that was never filed is no longer kept up.
 */
export async function archivesDue(today: string): Promise<
  {
    archiveObjectKey: string;
    /** No long-term copy yet: the signed original stands in. */
    neverMade: boolean;
    target: ArchiveTarget;
  }[]
> {
  const [documents, certificates] = await Promise.all([
    db
      .select({
        archiveObjectKey: governanceDocument.archiveObjectKey,
        archiveSha256: governanceDocument.archiveSha256,
        id: governanceDocument.id,
        objectKey: governanceDocument.objectKey,
        sha256: governanceDocument.sha256,
      })
      .from(governanceDocument)
      .where(lte(governanceDocument.archiveRenewOn, today)),
    db
      .select({
        archiveObjectKey: utilisationCertificate.archiveObjectKey,
        archiveSha256: utilisationCertificate.archiveSha256,
        id: utilisationCertificate.id,
        latestObjectKey: utilisationCertificate.latestObjectKey,
        latestSha256: utilisationCertificate.latestSha256,
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
  // A copy whose bytes are the signed original's was never made. Compared by
  // hash: a document filed once for several sources may name another key.
  return [
    ...documents.map((d) => ({
      archiveObjectKey: d.archiveObjectKey ?? d.objectKey,
      neverMade: !d.archiveSha256 || d.archiveSha256 === d.sha256,
      target: { documentId: d.id },
    })),
    ...certificates.map((c) => ({
      archiveObjectKey: c.archiveObjectKey ?? c.latestObjectKey,
      neverMade: !c.archiveSha256 || c.archiveSha256 === c.latestSha256,
      target: { certificateId: c.id },
    })),
  ];
}
