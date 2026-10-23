import { db } from "@pi-dash/db";
import { MeetingError } from "@pi-dash/db/queries/meetings";
import { DeclarationError } from "@pi-dash/db/queries/policies";
import {
  createSigningJob,
  currentCertificate,
  jobStatusFor,
} from "@pi-dash/db/queries/signing";
import { CertificateError } from "@pi-dash/db/queries/utilisation-certificates";
import { trustee } from "@pi-dash/db/schema/governance";
import { env } from "@pi-dash/env/server";
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import z from "zod";

import { runSessionAuditedAction } from "@/lib/audit";
import { assertRecentSignIn, CircularError } from "@/lib/governance/circulars";
import { circularKey, signingCopy } from "@/lib/governance/signing-copy";
import {
  startDeclarationJob,
  startMinutesJob,
} from "@/lib/governance/signing-jobs";
import {
  SigningServiceError,
  signingServiceConfigured,
  startRemoteSignature,
} from "@/lib/governance/signing-service";
import { startCertificateJob } from "@/lib/grants/utilisation-certificates";
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
      error instanceof CertificateError ||
      error instanceof CircularError ||
      error instanceof DeclarationError ||
      error instanceof MeetingError ||
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
  .validator(z.object({ circularId: z.uuid() }))
  .handler(async ({ context, data }) => {
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    const { session } = context;
    return await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "circular.sign.start",
        target: { id: data.circularId, type: "circular" },
      },
      () =>
        userFacing(async () => {
          assertRecentSignIn(session);
          const me = await linkedTrustee(session.user.id);
          if (!me) {
            throw new CircularError("Your account isn't linked to a trustee.");
          }
          const certificate = await currentCertificate(me.id);
          if (!certificate) {
            throw new CircularError(
              "Set up your DSC first: no valid certificate is enrolled for you."
            );
          }
          const copy = await signingCopy(data.circularId, me.id, {
            create: true,
          });
          const started = await startRemoteSignature({
            certificate: certificate.der,
            chain: certificate.chain,
            fieldName: copy.fieldName,
            pdf: copy.bytes,
          });
          const s3 = await getS3();
          const stateObjectKey = circularKey(
            data.circularId,
            `sign-state-${uuidv7()}.json`
          );
          await s3.write(stateObjectKey, started.state, {
            type: "application/json",
          });
          const job = await createSigningJob({
            basedOnSha256: copy.basedOnSha256,
            certificateId: certificate.id,
            circularId: data.circularId,
            fieldName: copy.fieldName,
            kind: "sign",
            stateObjectKey,
            toSign: started.toSign,
            trusteeId: me.id,
            userId: session.user.id,
          });
          return { jobId: job.id, link: helperLink("sign", job.token) };
        })
    );
  });

/** The chair signs the meeting's current minutes with the helper. */
export const startDscMinutesSigningFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ meetingId: z.uuid() }))
  .handler(async ({ context, data }) => {
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    const { session } = context;
    return await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "meeting.sign_minutes.start",
        target: { id: data.meetingId, type: "meeting" },
      },
      () =>
        userFacing(async () => {
          assertRecentSignIn(session);
          const me = await linkedTrustee(session.user.id);
          if (!me) {
            throw new CircularError("Your account isn't linked to a trustee.");
          }
          const job = await startMinutesJob({
            meetingId: data.meetingId,
            trusteeId: me.id,
            userId: session.user.id,
          });
          return { jobId: job.id, link: helperLink("sign", job.token) };
        })
    );
  });

/** A trustee signs their own declaration of interests with the helper. */
export const startDscDeclarationSigningFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ declarationId: z.uuid() }))
  .handler(async ({ context, data }) => {
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    const { session } = context;
    return await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "governance.sign_declaration.start",
        target: { id: data.declarationId, type: "conflict_declaration" },
      },
      () =>
        userFacing(async () => {
          assertRecentSignIn(session);
          const me = await linkedTrustee(session.user.id);
          if (!me) {
            throw new CircularError("Your account isn't linked to a trustee.");
          }
          const job = await startDeclarationJob({
            declarationId: data.declarationId,
            trusteeId: me.id,
            userId: session.user.id,
          });
          return { jobId: job.id, link: helperLink("sign", job.token) };
        })
    );
  });

/**
 * The Head of the Organisation or the Chief Finance Officer signs a grant's
 * utilisation certificate with the helper, when it's their turn.
 */
export const startDscCertificateSigningFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ certificateId: z.uuid() }))
  .handler(async ({ context, data }) => {
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    const { session } = context;
    return await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "utilisation_certificate.sign.start",
        target: { id: data.certificateId, type: "utilisation_certificate" },
      },
      () =>
        userFacing(async () => {
          assertRecentSignIn(session);
          const me = await linkedTrustee(session.user.id);
          if (!me) {
            throw new CircularError("Your account isn't linked to a trustee.");
          }
          const job = await startCertificateJob({
            certificateId: data.certificateId,
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
