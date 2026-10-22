import { type KeyObject, X509Certificate } from "node:crypto";

import { db } from "@pi-dash/db";
import { trusteeNamesForMatching } from "@pi-dash/db/queries/governance";
import { getMeeting, MeetingError } from "@pi-dash/db/queries/meetings";
import {
  DeclarationError,
  getConflictDeclaration,
} from "@pi-dash/db/queries/policies";
import { circularResolutions } from "@pi-dash/db/queries/resolutions";
import {
  type CertificateFacts,
  closeJob,
  createSigningJob,
  currentCertificate,
  enrolCertificate,
  getCertificate,
  jobOutcome,
  openJobForToken,
  type SigningJobRow,
  signatureRecordedSince,
  whileClaimed,
} from "@pi-dash/db/queries/signing";
import {
  CertificateError,
  getCertificate as getUtilisationCertificate,
} from "@pi-dash/db/queries/utilisation-certificates";
import { user } from "@pi-dash/db/schema/auth";
import { matchSignerToTrustee } from "@pi-dash/shared/governance";
import {
  circularReference,
  signatureFieldName,
} from "@pi-dash/shared/resolutions";
import { eq } from "drizzle-orm";
import { createRequestLogger } from "evlog";
import { uuidv7 } from "uuidv7";
import z from "zod";

import { type AuditTarget, runAuditedAction } from "../audit";
import { acceptSignedCertificate } from "../grants/utilisation-certificates";
import { getS3 } from "../s3";
import {
  acceptSignedDeclaration,
  acceptSignedMinutes,
  acceptSignedPdf,
  declarationKey,
  meetingKey,
  signedMessage,
} from "./accept-signature";
import { CircularError, UNTRUSTED_CERTIFICATE_MESSAGE } from "./circulars";
import {
  certificateTrusted,
  finishRemoteSignature,
  SigningServiceError,
  startRemoteSignature,
} from "./signing-service";

/**
 * The helper's side of a `pidash-sign://` link. It has no session: the
 * one-time job token (only its hash is stored, 15 minutes, single use)
 * stands for the trustee who started the job, and every completion is
 * audited in their name. A sign job signs a circular, for the chair a
 * meeting's minutes, a trustee's own declaration of interests, or as Head
 * of the Organisation or Chief Finance Officer a grant's utilisation
 * certificate.
 */

export interface JobReply {
  body: Record<string, unknown>;
  status: number;
}

const GONE: JobReply = {
  body: {
    message:
      "This signing link has expired or was already used. Start again in the dashboard.",
  },
  status: 404,
};

function signedReply(job: SigningJobRow): JobReply {
  let signedWhat = "circular";
  if (job.meetingId) {
    signedWhat = "minutes";
  } else if (job.declarationId) {
    signedWhat = "declaration";
  } else if (job.utilisationCertificateId) {
    signedWhat = "utilisation certificate";
  }
  return {
    body: {
      message: `Signed. Your signature is on the ${signedWhat}. You can return to the dashboard.`,
    },
    status: 200,
  };
}

const minutesDate = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "long",
  timeZone: "Asia/Kolkata",
});

const enrolBody = z.object({
  certificates: z.array(z.string().max(16_384)).min(1).max(8),
  chain: z.array(z.string().max(16_384)).max(8).default([]),
});

const signBody = z.object({
  certificate: z.string().max(16_384),
  signature: z.string().max(4096),
});

/** The helper gave up on the trustee's computer: a cancelled PIN, no token, a wrong PIN. */
const failedBody = z.object({ failed: z.string().trim().min(1).max(500) });

function commonName(distinguishedName: string): string | null {
  const line = distinguishedName
    .split(/\n|,\s*/)
    .find((part) => part.trim().startsWith("CN="));
  return line ? line.trim().slice(3) : null;
}

/** The EC curves the signing service signs with, P-256 and P-384, and the hash each uses. */
const SIGNING_CURVES = new Map<string, "sha256" | "sha384">([
  ["prime256v1", "sha256"],
  ["secp384r1", "sha384"],
]);

// The service applies the same rule in remote_sign.py (`algorithms`); keep them in step, the helper refuses a mismatch by messageDigest length.
/** The hash a signature with this key uses, or null when the service can't sign with it. */
function signingDigest(key: KeyObject): "sha256" | "sha384" | null {
  if (key.asymmetricKeyType === "rsa") {
    return "sha256";
  }
  if (key.asymmetricKeyType === "ec") {
    return (
      SIGNING_CURVES.get(key.asymmetricKeyDetails?.namedCurve ?? "") ?? null
    );
  }
  return null;
}

/**
 * What the dashboard keeps of a certificate, or null when it can't sign for
 * us: unreadable, not valid now, or a key other than RSA, P-256 or P-384.
 */
export function certificateFacts(
  derBase64: string,
  chain: string[],
  now: Date = new Date()
): (CertificateFacts & { commonName: string | null }) | null {
  let certificate: X509Certificate;
  let key: KeyObject;
  try {
    certificate = new X509Certificate(Buffer.from(derBase64, "base64"));
    // Bun can't decode some keys (secp256k1) and throws here.
    key = certificate.publicKey;
  } catch {
    return null;
  }
  const notBefore = new Date(certificate.validFrom);
  const notAfter = new Date(certificate.validTo);
  if (!(notBefore <= now && now < notAfter)) {
    return null;
  }
  if (!signingDigest(key)) {
    return null;
  }
  return {
    chain,
    commonName: commonName(certificate.subject),
    der: derBase64,
    issuer: commonName(certificate.issuer) ?? certificate.issuer,
    notAfter,
    notBefore,
    serial: certificate.serialNumber,
    sha256: certificate.fingerprint256.replaceAll(":", "").toLowerCase(),
    subject: commonName(certificate.subject) ?? certificate.subject,
  };
}

/**
 * Settles the job under this completion's claim and replies; null when the
 * claim was taken over, so the caller answers with how the job settled.
 */
async function settle(
  job: SigningJobRow,
  claim: Date,
  outcome: { error: string } | { ok: true },
  reply: JobReply
): Promise<JobReply | null> {
  return (await closeJob(job.id, claim, outcome)) ? reply : null;
}

async function actorFor(job: SigningJobRow) {
  const [row] = await db
    .select({ name: user.name, role: user.role })
    .from(user)
    .where(eq(user.id, job.userId))
    .limit(1);
  return {
    name: row?.name ?? "Trustee",
    role: row?.role ?? "unknown",
    userId: job.userId,
  };
}

/**
 * Reserves the chair's field in the meeting's current minutes for the
 * helper. Only the recorded chair signs, once the meeting is held and its
 * minutes are made and unsigned.
 */
export async function startMinutesJob(input: {
  meetingId: string;
  trusteeId: string;
  userId: string;
}): Promise<{ id: string; token: string }> {
  const row = await getMeeting(input.meetingId);
  if (!row) {
    throw new MeetingError("Meeting not found");
  }
  if (row.chairTrusteeId !== input.trusteeId) {
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
  const certificate = await currentCertificate(input.trusteeId);
  if (!certificate) {
    throw new CircularError(
      "Set up your DSC first: no valid certificate is enrolled for you."
    );
  }
  const s3 = await getS3();
  const pdf = new Uint8Array(await s3.file(row.minutesObjectKey).arrayBuffer());
  const fieldName = signatureFieldName(input.trusteeId);
  const started = await startRemoteSignature({
    certificate: certificate.der,
    chain: certificate.chain,
    fieldName,
    pdf,
  });
  const stateObjectKey = meetingKey(row.id, `sign-state-${uuidv7()}.json`);
  await s3.write(stateObjectKey, started.state, { type: "application/json" });
  return await createSigningJob({
    basedOnSha256: row.minutesSha256,
    certificateId: certificate.id,
    fieldName,
    kind: "sign",
    meetingId: row.id,
    stateObjectKey,
    toSign: started.toSign,
    trusteeId: input.trusteeId,
    userId: input.userId,
  });
}

/**
 * Reserves the trustee's field in their declaration waiting for signature,
 * for the helper. Only the trustee it belongs to signs it.
 */
export async function startDeclarationJob(input: {
  declarationId: string;
  trusteeId: string;
  userId: string;
}): Promise<{ id: string; token: string }> {
  const row = await getConflictDeclaration(input.declarationId);
  if (!row) {
    throw new DeclarationError("Declaration not found");
  }
  if (row.trusteeId !== input.trusteeId) {
    throw new DeclarationError(
      "Only the trustee who declared signs the declaration."
    );
  }
  if (!(row.status === "awaiting_signature" && row.objectKey)) {
    throw new DeclarationError("This declaration is already signed.");
  }
  const certificate = await currentCertificate(input.trusteeId);
  if (!certificate) {
    throw new CircularError(
      "Set up your DSC first: no valid certificate is enrolled for you."
    );
  }
  const s3 = await getS3();
  const pdf = new Uint8Array(await s3.file(row.objectKey).arrayBuffer());
  const fieldName = signatureFieldName(input.trusteeId);
  const started = await startRemoteSignature({
    certificate: certificate.der,
    chain: certificate.chain,
    fieldName,
    pdf,
  });
  const stateObjectKey = declarationKey(
    input.trusteeId,
    `sign-state-${uuidv7()}.json`
  );
  await s3.write(stateObjectKey, started.state, { type: "application/json" });
  return await createSigningJob({
    basedOnSha256: row.sha256,
    certificateId: certificate.id,
    declarationId: row.id,
    fieldName,
    kind: "sign",
    stateObjectKey,
    toSign: started.toSign,
    trusteeId: input.trusteeId,
    userId: input.userId,
  });
}

/**
 * The oldest helper the job API serves. Raise it when the helper must
 * change with the dashboard; older helpers send no version at all.
 */
const MIN_HELPER_VERSION = [0, 3, 0];

export const OUTDATED_HELPER_MESSAGE =
  "Update the signing helper: this one is too old for the dashboard. Download the new one from the Signing helper page, then try again.";

function helperCurrent(version: string | null): boolean {
  const parts = version
    ?.match(/^(\d+)\.(\d+)\.(\d+)$/)
    ?.slice(1)
    .map(Number);
  if (!parts) {
    return false;
  }
  for (const [index, minimum] of MIN_HELPER_VERSION.entries()) {
    const part = parts[index] ?? 0;
    if (part !== minimum) {
      return part > minimum;
    }
  }
  return true;
}

/**
 * Refuses a helper older than the dashboard serves, and fails its job with
 * the reason, since an old helper doesn't report failures the page can show.
 */
export async function refuseOutdatedHelper(
  token: string,
  version: string | null
): Promise<JobReply | null> {
  if (helperCurrent(version)) {
    return null;
  }
  await completeJob(token, { failed: OUTDATED_HELPER_MESSAGE });
  return { body: { message: OUTDATED_HELPER_MESSAGE }, status: 426 };
}

/** GET: what the helper should do, without revealing more than it needs. */
export async function describeJob(token: string): Promise<JobReply> {
  const job = await openJobForToken(token);
  if (!job) {
    return GONE;
  }
  if (job.kind === "enrol") {
    return {
      body: { kind: "enrol", signer: job.legalName, title: "DSC enrolment" },
      status: 200,
    };
  }
  const [resolutions, meeting, declaration, utilisation, certificate] =
    await Promise.all([
      job.circularId ? circularResolutions(job.circularId) : [],
      job.meetingId ? getMeeting(job.meetingId) : null,
      job.declarationId ? getConflictDeclaration(job.declarationId) : null,
      job.utilisationCertificateId
        ? getUtilisationCertificate(job.utilisationCertificateId)
        : null,
      job.certificateId ? getCertificate(job.certificateId) : null,
    ]);
  let title = `Circular ${job.circularId ? circularReference(job.circularId) : ""} (${resolutions.length} resolutions)`;
  if (meeting) {
    title = `Minutes of the board meeting of ${minutesDate.format(meeting.startsAt)}`;
  } else if (declaration) {
    title = `Declaration of interests for ${declaration.fiscalYear}`;
  } else if (utilisation) {
    title = `Utilisation certificate ${utilisation.number}: ${utilisation.snapshot.grant.title}`;
  } else if (resolutions.length === 1) {
    title = resolutions[0]?.title ?? "Circular";
  }
  return {
    body: {
      certificateSha256: certificate?.sha256 ?? null,
      // Enrolment took only keys the service signs with, so this reads one.
      digestAlgorithm: certificate
        ? signingDigest(
            new X509Certificate(Buffer.from(certificate.der, "base64"))
              .publicKey
          )
        : null,
      kind: "sign",
      signer: job.legalName,
      title,
      toSign: job.toSign,
    },
    status: 200,
  };
}

async function completeEnrolment(
  job: SigningJobRow & { legalName: string },
  input: z.infer<typeof enrolBody>,
  claim: Date
): Promise<JobReply | null> {
  const names = await trusteeNamesForMatching();
  const own = names.filter((n) => n.id === job.trusteeId);
  const facts = input.certificates
    .map((der) => certificateFacts(der, input.chain))
    .filter((f) => f !== null)
    .filter((f) => matchSignerToTrustee(f.commonName, own) === job.trusteeId);
  if (facts.length === 0) {
    const message = `None of the valid certificates on this token is in the name of ${job.legalName}. Plug in your own DSC token.`;
    return await settle(
      job,
      claim,
      { error: message },
      {
        body: { message },
        status: 422,
      }
    );
  }
  // A certificate in the trustee's name is a DSC only if a licensed CA issued it.
  let chosen: (typeof facts)[number] | undefined;
  try {
    for (const f of facts) {
      if (await certificateTrusted({ certificate: f.der, chain: f.chain })) {
        chosen = f;
        break;
      }
    }
  } catch (error) {
    if (!(error instanceof SigningServiceError)) {
      throw error;
    }
    return await settle(
      job,
      claim,
      { error: error.message },
      {
        body: { message: error.message },
        status: 422,
      }
    );
  }
  if (!chosen) {
    return await settle(
      job,
      claim,
      { error: UNTRUSTED_CERTIFICATE_MESSAGE },
      { body: { message: UNTRUSTED_CERTIFICATE_MESSAGE }, status: 422 }
    );
  }
  // Enrolling the same certificate again changes nothing.
  await enrolCertificate(job.trusteeId, chosen);
  return await settle(
    job,
    claim,
    { ok: true },
    {
      body: {
        message: `Your DSC (${chosen.subject}, valid until ${chosen.notAfter.toISOString().slice(0, 10)}) is registered in the dashboard. You can sign with it now.`,
      },
      status: 200,
    }
  );
}

async function completeSignature(
  job: SigningJobRow & { legalName: string },
  input: z.infer<typeof signBody>,
  claim: Date
): Promise<JobReply | null> {
  const certificate = job.certificateId
    ? await getCertificate(job.certificateId)
    : null;
  const {
    circularId,
    declarationId,
    meetingId,
    stateObjectKey,
    utilisationCertificateId,
  } = job;
  if (
    !(
      certificate &&
      (circularId || meetingId || declarationId || utilisationCertificateId) &&
      stateObjectKey
    )
  ) {
    return await settle(
      job,
      claim,
      { error: "This signing job is incomplete." },
      GONE
    );
  }
  const facts = certificateFacts(input.certificate, []);
  if (facts?.sha256 !== certificate.sha256) {
    const message =
      "The token signed with a different certificate from the one enrolled for you.";
    return await settle(
      job,
      claim,
      { error: message },
      {
        body: { message },
        status: 422,
      }
    );
  }
  try {
    const s3 = await getS3();
    const state = await s3.file(stateObjectKey).text();
    const signed = await finishRemoteSignature({
      signature: input.signature,
      state,
    });
    let message = "Signed. The minutes are filed in the vault.";
    if (utilisationCertificateId) {
      await acceptSignedCertificate({
        certificateId: utilisationCertificateId,
        expectedCertificateSha256: certificate.sha256,
        trusteeId: job.trusteeId,
        uploaded: signed,
      });
      message = "Signed. Your signature is on the utilisation certificate.";
    } else if (declarationId) {
      await acceptSignedDeclaration({
        declarationId,
        expectedCertificateSha256: certificate.sha256,
        uploaded: signed,
        userId: job.userId,
      });
      message = "Signed. Your declaration is filed in the vault.";
    } else if (meetingId) {
      await acceptSignedMinutes({
        expectedCertificateSha256: certificate.sha256,
        meetingId,
        uploaded: signed,
        userId: job.userId,
      });
    } else if (circularId) {
      const decisions = await acceptSignedPdf({
        circularId,
        expectedCertificateSha256: certificate.sha256,
        method: "dsc_helper",
        trustee: { id: job.trusteeId, legalName: job.legalName },
        uploaded: signed,
        userId: job.userId,
      });
      message = signedMessage(decisions);
    }
    await s3.delete(stateObjectKey).catch(() => undefined);
    return await settle(
      job,
      claim,
      { ok: true },
      {
        body: { message: `${message} You can return to the dashboard.` },
        status: 200,
      }
    );
  } catch (error) {
    // An earlier completion whose claim lapsed recorded the signature
    // meanwhile, so this one finds it stale: the job is done. Minutes are
    // signed only by the chair and a declaration only by its trustee, so
    // either signed is this job done too.
    let recorded = false;
    if (utilisationCertificateId) {
      // The certificate moved past this job's copy: recorded only if the
      // copy now holds this trustee's signature.
      const row = await getUtilisationCertificate(utilisationCertificateId);
      recorded =
        !!row &&
        ((row.headTrusteeId === job.trusteeId && !!row.headSignedAt) ||
          (row.financeTrusteeId === job.trusteeId && !!row.financeSignedAt));
    } else if (declarationId) {
      recorded =
        (await getConflictDeclaration(declarationId))?.status === "signed";
    } else if (meetingId) {
      recorded = !!(await getMeeting(meetingId))?.minutesDocumentId;
    } else if (circularId) {
      recorded = await signatureRecordedSince(
        circularId,
        job.trusteeId,
        job.createdAt
      );
    }
    if (recorded) {
      return await settle(job, claim, { ok: true }, signedReply(job));
    }
    if (
      error instanceof CertificateError ||
      error instanceof CircularError ||
      error instanceof DeclarationError ||
      error instanceof MeetingError ||
      error instanceof SigningServiceError
    ) {
      return await settle(
        job,
        claim,
        { error: error.message },
        {
          body: { message: error.message },
          status: 422,
        }
      );
    }
    throw error;
  }
}

/**
 * POST: the helper's result. Audited as the trustee who started the job.
 * One completion of a job runs at a time; another gets how the job
 * settled, or a 409 while the first is still running.
 */
export async function completeJob(
  token: string,
  rawBody: unknown
): Promise<JobReply> {
  const job = await openJobForToken(token);
  if (!job) {
    return GONE;
  }
  const reply = await whileClaimed(job.id, (claim) =>
    runJob(job, rawBody, claim)
  );
  if (reply) {
    return reply;
  }
  const settled = await jobOutcome(job.id);
  if (settled?.status === "completed") {
    return job.kind === "enrol"
      ? {
          body: { message: "Your DSC is registered in the dashboard." },
          status: 200,
        }
      : signedReply(job);
  }
  if (settled?.status === "failed") {
    return {
      body: {
        message: settled.error ?? "This signing job didn't go through.",
      },
      status: 422,
    };
  }
  return {
    body: { message: "This signing job is already in progress. Try again." },
    status: 409,
  };
}

async function runJob(
  job: SigningJobRow & { legalName: string },
  rawBody: unknown,
  claim: Date
): Promise<JobReply | null> {
  const actor = await actorFor(job);
  let action = "circular.sign";
  let target: AuditTarget = {
    id: job.circularId ?? undefined,
    type: "circular",
  };
  if (job.kind === "enrol") {
    action = "signing.enrol";
    target = { id: job.trusteeId, type: "trustee" };
  } else if (job.meetingId) {
    action = "meeting.sign_minutes";
    target = { id: job.meetingId, type: "meeting" };
  } else if (job.declarationId) {
    action = "governance.sign_declaration";
    target = { id: job.declarationId, type: "conflict_declaration" };
  } else if (job.utilisationCertificateId) {
    action = "utilisation_certificate.sign";
    target = {
      id: job.utilisationCertificateId,
      type: "utilisation_certificate",
    };
  }
  const failed = failedBody.safeParse(rawBody);
  try {
    return await runAuditedAction(
      {
        action,
        actor,
        metadata: { method: "dsc_helper" },
        target,
      },
      async () => {
        if (failed.success) {
          // Closing the job stops the page waiting and shows it the reason.
          return await settle(
            job,
            claim,
            { error: failed.data.failed },
            { body: { message: "The dashboard knows it failed." }, status: 200 }
          );
        }
        if (job.kind === "enrol") {
          const parsed = enrolBody.safeParse(rawBody);
          if (!parsed.success) {
            return {
              body: { message: "The helper sent no certificate." },
              status: 400,
            };
          }
          return await completeEnrolment(job, parsed.data, claim);
        }
        const parsed = signBody.safeParse(rawBody);
        if (!parsed.success) {
          return {
            body: { message: "The helper sent no signature." },
            status: 400,
          };
        }
        return await completeSignature(job, parsed.data, claim);
      },
      (reply) =>
        reply?.status === 200 && !failed.success ? "success" : "failure"
    );
  } catch (error) {
    const log = createRequestLogger({
      method: "POST",
      path: "/api/signing/jobs",
    });
    log.set({ event: "signing_job_failed", jobId: job.id, kind: job.kind });
    log.error(error instanceof Error ? error : String(error));
    log.emit();
    const message = "Something went wrong while signing. Try again.";
    const lost = await closeJob(job.id, claim, { error: message }).then(
      (closed) => !closed,
      () => false
    );
    return lost ? null : { body: { message }, status: 500 };
  }
}
