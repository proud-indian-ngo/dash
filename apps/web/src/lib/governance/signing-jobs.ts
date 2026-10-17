import { X509Certificate } from "node:crypto";

import { db } from "@pi-dash/db";
import { trusteeNamesForMatching } from "@pi-dash/db/queries/governance";
import { getResolution } from "@pi-dash/db/queries/resolutions";
import {
  type CertificateFacts,
  closeJob,
  enrolCertificate,
  getCertificate,
  openJobForToken,
  type SigningJobRow,
} from "@pi-dash/db/queries/signing";
import { user } from "@pi-dash/db/schema/auth";
import { matchSignerToTrustee } from "@pi-dash/shared/governance";
import { eq } from "drizzle-orm";
import { createRequestLogger } from "evlog";
import z from "zod";

import { runAuditedAction } from "../audit";
import { getS3 } from "../s3";
import { acceptSignedPdf } from "./accept-signature";
import { CircularError } from "./circulars";
import { finishRemoteSignature, SigningServiceError } from "./signing-service";

/**
 * The helper's side of a `pidash-sign://` link. It has no session: the
 * one-time job token (only its hash is stored, 15 minutes, single use)
 * stands for the trustee who started the job, and every completion is
 * audited in their name.
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

const enrolBody = z.object({
  certificates: z.array(z.string().max(16_384)).min(1).max(8),
  chain: z.array(z.string().max(16_384)).max(8).default([]),
});

const signBody = z.object({
  certificate: z.string().max(16_384),
  signature: z.string().max(4096),
});

function commonName(distinguishedName: string): string | null {
  const line = distinguishedName
    .split(/\n|,\s*/)
    .find((part) => part.trim().startsWith("CN="));
  return line ? line.trim().slice(3) : null;
}

/** What the dashboard keeps of a certificate, or null when it can't sign for us. */
export function certificateFacts(
  derBase64: string,
  chain: string[],
  now: Date = new Date()
): (CertificateFacts & { commonName: string | null }) | null {
  let certificate: X509Certificate;
  try {
    certificate = new X509Certificate(Buffer.from(derBase64, "base64"));
  } catch {
    return null;
  }
  const notBefore = new Date(certificate.validFrom);
  const notAfter = new Date(certificate.validTo);
  if (!(notBefore <= now && now < notAfter)) {
    return null;
  }
  if (certificate.publicKey.asymmetricKeyType !== "rsa") {
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
  const [resolution, certificate] = await Promise.all([
    job.resolutionId ? getResolution(job.resolutionId) : null,
    job.certificateId ? getCertificate(job.certificateId) : null,
  ]);
  return {
    body: {
      certificateSha256: certificate?.sha256 ?? null,
      kind: "sign",
      signer: job.legalName,
      title: resolution?.title ?? "Resolution",
      toSign: job.toSign,
    },
    status: 200,
  };
}

async function completeEnrolment(
  job: SigningJobRow & { legalName: string },
  input: z.infer<typeof enrolBody>
): Promise<JobReply> {
  const names = await trusteeNamesForMatching();
  const own = names.filter((n) => n.id === job.trusteeId);
  const facts = input.certificates
    .map((der) => certificateFacts(der, input.chain))
    .filter((f) => f !== null)
    .filter((f) => matchSignerToTrustee(f.commonName, own) === job.trusteeId);
  const [chosen] = facts;
  if (!chosen) {
    const message = `None of the valid certificates on this token is in the name of ${job.legalName}. Plug in your own DSC token.`;
    await closeJob(job.id, { error: message });
    return { body: { message }, status: 422 };
  }
  await enrolCertificate(job.trusteeId, chosen);
  await closeJob(job.id, { ok: true });
  return {
    body: {
      message: `Your DSC (${chosen.subject}, valid until ${chosen.notAfter.toISOString().slice(0, 10)}) is registered in the dashboard. You can sign circulars with it now.`,
    },
    status: 200,
  };
}

async function completeSignature(
  job: SigningJobRow & { legalName: string },
  input: z.infer<typeof signBody>
): Promise<JobReply> {
  const certificate = job.certificateId
    ? await getCertificate(job.certificateId)
    : null;
  if (!(certificate && job.resolutionId && job.stateObjectKey)) {
    await closeJob(job.id, { error: "This signing job is incomplete." });
    return GONE;
  }
  const facts = certificateFacts(input.certificate, []);
  if (facts?.sha256 !== certificate.sha256) {
    const message =
      "The token signed with a different certificate from the one enrolled for you.";
    await closeJob(job.id, { error: message });
    return { body: { message }, status: 422 };
  }
  try {
    const s3 = await getS3();
    const state = await s3.file(job.stateObjectKey).text();
    const signed = await finishRemoteSignature({
      signature: input.signature,
      state,
    });
    const decision = await acceptSignedPdf({
      expectedCertificateSha256: certificate.sha256,
      method: "dsc_helper",
      resolutionId: job.resolutionId,
      trustee: { id: job.trusteeId, legalName: job.legalName },
      uploaded: signed,
      userId: job.userId,
    });
    await s3.delete(job.stateObjectKey).catch(() => undefined);
    await closeJob(job.id, { ok: true });
    return {
      body: {
        message:
          decision.status === "passed"
            ? `Signed. The resolution passed as ${decision.number ?? ""}. You can return to the dashboard.`
            : "Signed. Your signature is on the circular. You can return to the dashboard.",
        status: decision.status,
      },
      status: 200,
    };
  } catch (error) {
    if (
      error instanceof CircularError ||
      error instanceof SigningServiceError
    ) {
      await closeJob(job.id, { error: error.message });
      return { body: { message: error.message }, status: 422 };
    }
    throw error;
  }
}

/** POST: the helper's result. Audited as the trustee who started the job. */
export async function completeJob(
  token: string,
  rawBody: unknown
): Promise<JobReply> {
  const job = await openJobForToken(token);
  if (!job) {
    return GONE;
  }
  const actor = await actorFor(job);
  const action = job.kind === "enrol" ? "signing.enrol" : "resolution.sign";
  try {
    return await runAuditedAction(
      {
        action,
        actor,
        metadata: { method: "dsc_helper" },
        target:
          job.kind === "enrol"
            ? { id: job.trusteeId, type: "trustee" }
            : { id: job.resolutionId ?? undefined, type: "resolution" },
      },
      async () => {
        if (job.kind === "enrol") {
          const parsed = enrolBody.safeParse(rawBody);
          if (!parsed.success) {
            return {
              body: { message: "The helper sent no certificate." },
              status: 400,
            };
          }
          return await completeEnrolment(job, parsed.data);
        }
        const parsed = signBody.safeParse(rawBody);
        if (!parsed.success) {
          return {
            body: { message: "The helper sent no signature." },
            status: 400,
          };
        }
        return await completeSignature(job, parsed.data);
      },
      (reply) => (reply.status === 200 ? "success" : "failure")
    );
  } catch (error) {
    const log = createRequestLogger({
      method: "POST",
      path: "/api/signing/jobs",
    });
    log.set({ event: "signing_job_failed", jobId: job.id, kind: job.kind });
    log.error(error instanceof Error ? error : String(error));
    log.emit();
    await closeJob(job.id, {
      error: "Something went wrong while signing. Try again.",
    }).catch(() => undefined);
    return {
      body: { message: "Something went wrong while signing. Try again." },
      status: 500,
    };
  }
}
