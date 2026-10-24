import { db } from "@pi-dash/db";
import { MeetingError } from "@pi-dash/db/queries/meetings";
import { DeclarationError } from "@pi-dash/db/queries/policies";
import { circularResolutions } from "@pi-dash/db/queries/resolutions";
import { currentCertificate } from "@pi-dash/db/queries/signing";
import { CertificateError } from "@pi-dash/db/queries/utilisation-certificates";
import { trustee } from "@pi-dash/db/schema/governance";
import { circularReference } from "@pi-dash/shared/resolutions";
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import z from "zod";

import { runSessionAuditedAction } from "@/lib/audit";
import { assertRecentSignIn, CircularError } from "@/lib/governance/circulars";
import { signingCopy } from "@/lib/governance/signing-copy";
import {
  jobStatusFor,
  startDeclarationJob,
  startEnrolJob,
  startMinutesJob,
  startSignJob,
} from "@/lib/governance/signing-jobs";
import {
  SigningServiceError,
  signingServiceConfigured,
} from "@/lib/governance/signing-service";
import { startCertificateJob } from "@/lib/grants/utilisation-certificates";
import { HttpError, userFacingError } from "@/lib/http-error";
import { authMiddleware } from "@/middleware/auth";

/**
 * Starting DSC helper jobs. The page opens the returned `signr://` link and
 * polls the job with its token; the helper completes it through
 * /api/signing/v1/jobs/<token>.
 */

async function linkedTrustee(userId: string) {
  const [row] = await db
    .select({ id: trustee.id, legalName: trustee.legalName })
    .from(trustee)
    .where(eq(trustee.userId, userId))
    .limit(1);
  return row ?? null;
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
      throw userFacingError(error);
    }
    throw error;
  });
}

/** The signed-in trustee's enrolled DSC, and whether signing with it works here. */
export const getMyDscStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
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
      throw new HttpError(401, "Unauthorized");
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
          return await startEnrolJob({
            trustee: me,
            userId: session.user.id,
          });
        })
    );
  });

export const startDscSigningFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ circularId: z.uuid() }))
  .handler(async ({ context, data }) => {
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
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
          const [copy, resolutions] = await Promise.all([
            signingCopy(data.circularId, me.id, { create: true }),
            circularResolutions(data.circularId),
          ]);
          return await startSignJob({
            fieldName: copy.fieldName,
            pdf: copy.bytes,
            target: { id: data.circularId, type: "circular" },
            title:
              resolutions.length === 1
                ? (resolutions[0]?.title ?? "Circular")
                : `Circular ${circularReference(data.circularId)} (${resolutions.length} resolutions)`,
            trustee: me,
            userId: session.user.id,
          });
        })
    );
  });

/** The chair signs the meeting's current minutes with the helper. */
export const startDscMinutesSigningFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ meetingId: z.uuid() }))
  .handler(async ({ context, data }) => {
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
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
          return await startMinutesJob({
            meetingId: data.meetingId,
            trustee: me,
            userId: session.user.id,
          });
        })
    );
  });

/** A trustee signs their own declaration of interests with the helper. */
export const startDscDeclarationSigningFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ declarationId: z.uuid() }))
  .handler(async ({ context, data }) => {
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
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
          return await startDeclarationJob({
            declarationId: data.declarationId,
            trustee: me,
            userId: session.user.id,
          });
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
      throw new HttpError(401, "Unauthorized");
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
          return await startCertificateJob({
            certificateId: data.certificateId,
            trustee: me,
            userId: session.user.id,
          });
        })
    );
  });

export const getSigningJobStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ token: z.string().max(128) }))
  .handler(async ({ context, data }) => {
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
    }
    const status = await jobStatusFor(data.token, context.session.user.id);
    if (!status) {
      throw new HttpError(404, "Not found");
    }
    return status;
  });
