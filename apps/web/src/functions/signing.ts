import { db } from "@pi-dash/db";
import { currentRevision, responseFor } from "@pi-dash/db/queries/resolutions";
import {
  createSigningJob,
  currentCertificate,
  jobStatusFor,
} from "@pi-dash/db/queries/signing";
import { trustee } from "@pi-dash/db/schema/governance";
import { env } from "@pi-dash/env/server";
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import z from "zod";

import { runSessionAuditedAction } from "@/lib/audit";
import { assertRecentSignIn, CircularError } from "@/lib/governance/circulars";
import {
  SigningServiceError,
  signingServiceConfigured,
  startRemoteSignature,
} from "@/lib/governance/signing-service";
import { getS3 } from "@/lib/s3";
import { authMiddleware } from "@/middleware/auth";

/**
 * Starting DSC helper jobs. The page opens the returned `pidash-sign://`
 * link and polls the job; the helper completes it through
 * /api/signing/jobs/$token.
 */

async function linkedTrustee(userId: string) {
  const [row] = await db
    .select({ id: trustee.id, legalName: trustee.legalName })
    .from(trustee)
    .where(eq(trustee.userId, userId))
    .limit(1);
  return row ?? null;
}

function helperLink(kind: "enrol" | "sign", token: string): string {
  const server = env.APP_URL ?? env.BETTER_AUTH_URL;
  return `pidash-sign://${kind}?job=${token}&server=${encodeURIComponent(server)}`;
}

function userFacing<T>(run: () => Promise<T>): Promise<T> {
  return run().catch((error: unknown) => {
    if (
      error instanceof CircularError ||
      error instanceof SigningServiceError
    ) {
      throw new Error(error.message);
    }
    throw error;
  });
}

/** The signed-in trustee's enrolled DSC, and whether signing with it works here. */
export const getMyDscStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    const me = await linkedTrustee(context.session.user.id);
    const certificate = me ? await currentCertificate(me.id) : null;
    return {
      certificate: certificate
        ? {
            issuer: certificate.issuer,
            notAfter: certificate.notAfter.toISOString(),
            subject: certificate.subject,
          }
        : null,
      helperAvailable: signingServiceConfigured(),
      isTrustee: me !== null,
    };
  });

export const startDscEnrolmentFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    const { session } = context;
    return await runSessionAuditedAction(
      session,
      context.headers,
      { action: "signing.enrol.start", target: { type: "trustee" } },
      () =>
        userFacing(async () => {
          const me = await linkedTrustee(session.user.id);
          if (!me) {
            throw new CircularError("Your account isn't linked to a trustee.");
          }
          const job = await createSigningJob({
            kind: "enrol",
            trusteeId: me.id,
            userId: session.user.id,
          });
          return { jobId: job.id, link: helperLink("enrol", job.token) };
        })
    );
  });

export const startDscSigningFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ resolutionId: z.uuid() }))
  .handler(async ({ context, data }) => {
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    const { session } = context;
    return await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "resolution.sign.start",
        target: { id: data.resolutionId, type: "resolution" },
      },
      () =>
        userFacing(async () => {
          assertRecentSignIn(session);
          const me = await linkedTrustee(session.user.id);
          if (!me) {
            throw new CircularError("Your account isn't linked to a trustee.");
          }
          const [response, revision, certificate] = await Promise.all([
            responseFor(data.resolutionId, me.id),
            currentRevision(data.resolutionId),
            currentCertificate(me.id),
          ]);
          if (!(response && revision)) {
            throw new CircularError(
              "You weren't a trustee in office when this was issued."
            );
          }
          if (response.response !== "pending" || response.conflictDeclared) {
            throw new CircularError("You have already responded.");
          }
          if (!certificate) {
            throw new CircularError(
              "Set up your DSC first: no valid certificate is enrolled for you."
            );
          }
          const s3 = await getS3();
          const pdf = new Uint8Array(
            await s3.file(revision.latestObjectKey).arrayBuffer()
          );
          const started = await startRemoteSignature({
            certificate: certificate.der,
            chain: certificate.chain,
            fieldName: response.fieldName,
            pdf,
          });
          const stateObjectKey = `${env.R2_KEY_PREFIX}/governance/resolutions/${data.resolutionId}/sign-state-${uuidv7()}.json`;
          await s3.write(stateObjectKey, started.state, {
            type: "application/json",
          });
          const job = await createSigningJob({
            basedOnSha256: revision.latestSha256,
            certificateId: certificate.id,
            fieldName: response.fieldName,
            kind: "sign",
            resolutionId: data.resolutionId,
            stateObjectKey,
            toSign: started.toSign,
            trusteeId: me.id,
            userId: session.user.id,
          });
          return { jobId: job.id, link: helperLink("sign", job.token) };
        })
    );
  });

export const getSigningJobStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ jobId: z.uuid() }))
  .handler(async ({ context, data }) => {
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    const status = await jobStatusFor(data.jobId, context.session.user.id);
    if (!status) {
      throw new Error("Not found");
    }
    return status;
  });
