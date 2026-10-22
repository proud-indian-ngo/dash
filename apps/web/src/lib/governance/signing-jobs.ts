import { db } from "@pi-dash/db";
import { trusteeNamesForMatching } from "@pi-dash/db/queries/governance";
import { getMeeting, MeetingError } from "@pi-dash/db/queries/meetings";
import {
  DeclarationError,
  getConflictDeclaration,
} from "@pi-dash/db/queries/policies";
import {
  currentCertificate,
  enrolCertificate,
  expireSigningJobs,
  getSigningJob,
  insertSigningJob,
  signatureRecordedSince,
  transitionSigningJob,
} from "@pi-dash/db/queries/signing";
import {
  CertificateError,
  getCertificate as getUtilisationCertificate,
} from "@pi-dash/db/queries/utilisation-certificates";
import { user } from "@pi-dash/db/schema/auth";
import { env } from "@pi-dash/env/server";
import { matchSignerToTrustee } from "@pi-dash/shared/governance";
import { signatureFieldName } from "@pi-dash/shared/resolutions";
import {
  type Adapter,
  type CertificateFacts,
  type CompletedResult,
  createSignr,
  type Job,
  type JobFailure,
  JobRefused,
  type JobStatus,
  ServiceClient,
  type Signr,
} from "@signr/server";
import { eq } from "drizzle-orm";
import z from "zod";

import { type AuditTarget, runAuditedAction } from "../audit";
import { trustedClientIp } from "../client-ip";
import { acceptSignedCertificate } from "../grants/utilisation-certificates";
import { checkRateLimit } from "../rate-limit";
import { getS3 } from "../s3";
import {
  acceptSignedDeclaration,
  acceptSignedMinutes,
  acceptSignedPdf,
} from "./accept-signature";
import { CircularError } from "./circulars";
import { SigningServiceError } from "./signing-service";

/**
 * DSC helper jobs on `@signr/server`. The page opens a `signr://` link; the
 * helper talks to the job endpoint under /api/signing with no session: the
 * one-time job token stands for the trustee who started the job, and every
 * completion is audited in their name. A sign job signs a circular, for the
 * chair a meeting's minutes, a trustee's own declaration of interests, or as
 * Head of the Organisation or Chief Finance Officer a grant's utilisation
 * certificate.
 */

/** Job URLs are `<origin>/api/signing/v1/jobs/<token>`. */
const SIGNR_BASE_PATH = "/api/signing";

/**
 * The oldest signr helper the job endpoint serves. Raise it when the helper
 * must change with the dashboard; older helpers are told to update.
 */
const MIN_HELPER_VERSION = "0.1.0";

/** The signing plugin's stamp: the name over a faint Proud Indian symbol. */
const STAMP_STYLE = "proud-indian";

const minutesDate = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "long",
  timeZone: "Asia/Kolkata",
});

/** Who started a job and what it signs, kept as the job's `reference`. */
const jobReference = z.object({
  target: z.discriminatedUnion("type", [
    z.object({ type: z.literal("enrol") }),
    z.object({ id: z.string(), type: z.literal("circular") }),
    z.object({ id: z.string(), type: z.literal("declaration") }),
    z.object({ id: z.string(), type: z.literal("meeting") }),
    z.object({ id: z.string(), type: z.literal("utilisation_certificate") }),
  ]),
  trusteeId: z.string(),
  userId: z.string(),
});
type JobReference = z.infer<typeof jobReference>;
type SignTarget = Exclude<JobReference["target"], { type: "enrol" }>;

function readReference(reference: string | null): JobReference {
  return jobReference.parse(JSON.parse(reference ?? "null"));
}

/**
 * Admits http://localhost and 127.0.0.1 job URLs besides https, in
 * development and E2E (which runs with NODE_ENV=test); the helper refuses
 * those unless told otherwise.
 */
const allowInsecureOrigin = env.NODE_ENV !== "production";

function blobKey(key: string): string {
  return `${env.R2_KEY_PREFIX}/governance/signing-jobs/${key}`;
}

function commonName(distinguishedName: string): string | null {
  const part = distinguishedName
    .split(", ")
    .find((line) => line.startsWith("CN="));
  return part ? part.slice(3) : null;
}

async function actorFor(userId: string) {
  const [row] = await db
    .select({ name: user.name, role: user.role })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return {
    name: row?.name ?? "Trustee",
    role: row?.role ?? "unknown",
    userId,
  };
}

function auditFor({ target, trusteeId }: JobReference): {
  action: string;
  target: AuditTarget;
} {
  if (target.type === "enrol") {
    return {
      action: "signing.enrol",
      target: { id: trusteeId, type: "trustee" },
    };
  }
  if (target.type === "meeting") {
    return {
      action: "meeting.sign_minutes",
      target: { id: target.id, type: "meeting" },
    };
  }
  if (target.type === "declaration") {
    return {
      action: "governance.sign_declaration",
      target: { id: target.id, type: "conflict_declaration" },
    };
  }
  if (target.type === "utilisation_certificate") {
    return {
      action: "utilisation_certificate.sign",
      target: { id: target.id, type: "utilisation_certificate" },
    };
  }
  return {
    action: "circular.sign",
    target: { id: target.id, type: "circular" },
  };
}

/** Keeps the certificate when it is in the trustee's own name. */
async function enrol(
  job: Job,
  { trusteeId }: JobReference,
  certificate: CertificateFacts
): Promise<void> {
  const names = await trusteeNamesForMatching();
  const own = names.filter((n) => n.id === trusteeId);
  if (matchSignerToTrustee(certificate.subjectCommonName, own) !== trusteeId) {
    throw new JobRefused(
      `This certificate is not in the name of ${job.signer}. Plug in your own DSC token.`
    );
  }
  // Enrolling the same certificate again changes nothing.
  await enrolCertificate(trusteeId, {
    chain: certificate.chain,
    der: certificate.der,
    issuer: commonName(certificate.issuer) ?? certificate.issuer,
    notAfter: certificate.notAfter,
    notBefore: certificate.notBefore,
    serial: certificate.serialNumber,
    sha256: certificate.sha256,
    subject: certificate.subjectCommonName ?? certificate.subject,
  });
}

/**
 * Whether the signature is already recorded: a completion whose settle
 * lease lapsed may have filed it while this one took over. Minutes are
 * signed only by the chair and a declaration only by its trustee, so
 * either signed is this job done. A utilisation certificate moved past this
 * job's copy only if the copy now holds this trustee's signature.
 */
async function signatureRecorded(
  job: Job,
  target: SignTarget,
  trusteeId: string
): Promise<boolean> {
  if (target.type === "utilisation_certificate") {
    const row = await getUtilisationCertificate(target.id);
    return (
      !!row &&
      ((row.headTrusteeId === trusteeId && !!row.headSignedAt) ||
        (row.financeTrusteeId === trusteeId && !!row.financeSignedAt))
    );
  }
  if (target.type === "declaration") {
    return (await getConflictDeclaration(target.id))?.status === "signed";
  }
  if (target.type === "meeting") {
    return !!(await getMeeting(target.id))?.minutesDocumentId;
  }
  return await signatureRecordedSince(target.id, trusteeId, job.createdAt);
}

/**
 * Files the signed PDF where the circular, minutes, declaration or
 * utilisation certificate flow keeps it.
 */
async function fileSigned(
  job: Job,
  { target, trusteeId, userId }: JobReference,
  { certificate, pdf }: Extract<CompletedResult, { kind: "sign" }>
): Promise<void> {
  if (target.type === "enrol") {
    throw new Error(`Sign job ${job.id} names no document`);
  }
  const expectedCertificateSha256 = certificate.sha256;
  try {
    if (target.type === "utilisation_certificate") {
      await acceptSignedCertificate({
        certificateId: target.id,
        expectedCertificateSha256,
        trusteeId,
        uploaded: pdf,
      });
    } else if (target.type === "declaration") {
      await acceptSignedDeclaration({
        declarationId: target.id,
        expectedCertificateSha256,
        uploaded: pdf,
        userId,
      });
    } else if (target.type === "meeting") {
      await acceptSignedMinutes({
        expectedCertificateSha256,
        meetingId: target.id,
        uploaded: pdf,
        userId,
      });
    } else {
      await acceptSignedPdf({
        circularId: target.id,
        expectedCertificateSha256,
        method: "dsc_helper",
        trustee: { id: trusteeId, legalName: job.signer },
        uploaded: pdf,
        userId,
      });
    }
  } catch (error) {
    if (await signatureRecorded(job, target, trusteeId)) {
      return;
    }
    if (
      error instanceof CertificateError ||
      error instanceof CircularError ||
      error instanceof DeclarationError ||
      error instanceof MeetingError ||
      error instanceof SigningServiceError
    ) {
      throw new JobRefused(error.message);
    }
    throw error;
  }
}

/**
 * signr's completion callback, audited as the trustee who started the job.
 * A retry after a lapsed settle lease may call it again for the same job.
 */
async function completeJob(job: Job, result: CompletedResult): Promise<void> {
  const reference = readReference(job.reference);
  await runAuditedAction(
    {
      ...auditFor(reference),
      actor: await actorFor(reference.userId),
      metadata: { jobId: job.id, method: "dsc_helper" },
    },
    async () => {
      if (result.kind === "enrol") {
        await enrol(job, reference, result.certificate);
      } else {
        await fileSigned(job, reference, result);
      }
    }
  );
}

/**
 * signr's failure callback: a failure the helper reported, or one the server
 * decided (a refused certificate or signature, a `JobRefused`, an outdated
 * helper), audited as a failure of the job's action in the trustee's name.
 * The message is free text, so it stays on the job and out of the audit log.
 */
async function failJob(job: Job, { reportedBy }: JobFailure): Promise<void> {
  const reference = readReference(job.reference);
  await runAuditedAction(
    {
      ...auditFor(reference),
      actor: await actorFor(reference.userId),
      metadata: { jobId: job.id, method: "dsc_helper", reportedBy },
    },
    async () => undefined,
    () => "failure"
  );
}

/** Job rows in PostgreSQL; the PDF and the service's state in R2. */
const adapter: Adapter = {
  create: insertSigningJob,
  async deleteBlob(key) {
    await getS3().delete(blobKey(key));
  },
  expireOlderThan: expireSigningJobs,
  get: getSigningJob,
  async getBlob(key) {
    const file = getS3().file(blobKey(key));
    return (await file.exists())
      ? new Uint8Array(await file.arrayBuffer())
      : null;
  },
  onCompleted: completeJob,
  onFailed: failJob,
  async putBlob(key, bytes) {
    await getS3().write(blobKey(key), bytes);
  },
  transition: transitionSigningJob,
};

let signr: Signr | null = null;

/** The job API; throws when the signing service isn't configured here. */
export function signrJobs(): Signr {
  if (!(env.SIGNING_SERVICE_URL && env.SIGNING_SERVICE_TOKEN)) {
    throw new SigningServiceError(
      "Signing needs the signing service, which isn't set up here.",
      { fault: true }
    );
  }
  signr ??= createSignr({
    adapter,
    allowInsecureOrigin,
    basePath: SIGNR_BASE_PATH,
    branding: { name: "Proud Indian" },
    minHelperVersion: MIN_HELPER_VERSION,
    origin: new URL(env.APP_URL ?? env.BETTER_AUTH_URL).origin,
    rateLimit: (request) =>
      checkRateLimit(`signing-job:${trustedClientIp(request) ?? "unknown"}`, 30)
        .allowed,
    service: new ServiceClient({
      token: env.SIGNING_SERVICE_TOKEN,
      url: env.SIGNING_SERVICE_URL,
    }),
  });
  return signr;
}

interface StartedJob {
  link: string;
  token: string;
}

interface Signer {
  trustee: { id: string; legalName: string };
  userId: string;
}

/** An enrol job: the helper sends a certificate from the trustee's token. */
export async function startEnrolJob({
  trustee,
  userId,
}: Signer): Promise<StartedJob> {
  const reference: JobReference = {
    target: { type: "enrol" },
    trusteeId: trustee.id,
    userId,
  };
  const { link, token } = await signrJobs().createEnrolJob({
    reference: JSON.stringify(reference),
    signer: trustee.legalName,
    title: "DSC enrolment",
  });
  return { link, token };
}

/**
 * A sign job on `pdf`, which has the trustee's empty signature field
 * `fieldName`. Only the trustee's enrolled certificate may sign it.
 */
export async function startSignJob({
  fieldName,
  pdf,
  target,
  title,
  trustee,
  userId,
}: Signer & {
  fieldName: string;
  pdf: Uint8Array;
  target: SignTarget;
  title: string;
}): Promise<StartedJob> {
  const certificate = await currentCertificate(trustee.id);
  if (!certificate) {
    throw new CircularError(
      "Set up your DSC first: no valid certificate is enrolled for you."
    );
  }
  const reference: JobReference = { target, trusteeId: trustee.id, userId };
  const { link, token } = await signrJobs().createSignJob({
    expectedCertificateSha256: certificate.sha256,
    fieldName,
    pdf,
    reference: JSON.stringify(reference),
    signer: trustee.legalName,
    stampStyle: STAMP_STYLE,
    title,
  });
  return { link, token };
}

/**
 * A job on the meeting's current minutes for the chair. Only the recorded
 * chair signs, once the meeting is held and its minutes are made and
 * unsigned.
 */
export async function startMinutesJob({
  meetingId,
  ...signer
}: Signer & { meetingId: string }): Promise<StartedJob> {
  const row = await getMeeting(meetingId);
  if (!row) {
    throw new MeetingError("Meeting not found");
  }
  if (row.chairTrusteeId !== signer.trustee.id) {
    throw new MeetingError("Only the chair of the meeting signs its minutes.");
  }
  if (row.status !== "held") {
    throw new MeetingError("Mark the meeting held first.");
  }
  if (row.minutesDocumentId) {
    throw new MeetingError("The minutes are already signed.");
  }
  if (!row.minutesObjectKey) {
    throw new MeetingError("Generate the minutes first.");
  }
  const pdf = new Uint8Array(
    await getS3().file(row.minutesObjectKey).arrayBuffer()
  );
  return await startSignJob({
    ...signer,
    fieldName: signatureFieldName(signer.trustee.id),
    pdf,
    target: { id: row.id, type: "meeting" },
    title: `Minutes of the board meeting of ${minutesDate.format(row.startsAt)}`,
  });
}

/**
 * A job on the trustee's declaration waiting for signature. Only the
 * trustee it belongs to signs it.
 */
export async function startDeclarationJob({
  declarationId,
  ...signer
}: Signer & { declarationId: string }): Promise<StartedJob> {
  const row = await getConflictDeclaration(declarationId);
  if (!row) {
    throw new DeclarationError("Declaration not found");
  }
  if (row.trusteeId !== signer.trustee.id) {
    throw new DeclarationError(
      "Only the trustee who declared signs the declaration."
    );
  }
  if (!(row.status === "awaiting_signature" && row.objectKey)) {
    throw new DeclarationError("This declaration is already signed.");
  }
  const pdf = new Uint8Array(await getS3().file(row.objectKey).arrayBuffer());
  return await startSignJob({
    ...signer,
    fieldName: signatureFieldName(signer.trustee.id),
    pdf,
    target: { id: row.id, type: "declaration" },
    title: `Declaration of interests for ${row.fiscalYear}`,
  });
}

/** What the person's page polls for: their own job only, null otherwise. */
export async function jobStatusFor(
  token: string,
  userId: string
): Promise<Pick<JobStatus, "message" | "state"> | null> {
  const status = await signrJobs().status(token);
  if (!status || readReference(status.reference).userId !== userId) {
    return null;
  }
  return {
    state: status.state,
    ...(status.message === undefined ? {} : { message: status.message }),
  };
}
