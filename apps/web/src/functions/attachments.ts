import { env } from "@pi-dash/env/server";
import { withProtectedR2ObjectDeleteLock } from "@pi-dash/jobs/lib/protected-r2-reference";
import { logErrorAndRethrow } from "@pi-dash/observability";
import {
  ALLOWED_MIME_TYPES,
  type AllowedMimeType,
} from "@pi-dash/shared/constants";
import {
  buildAvatarMediaUrl,
  buildEventUpdateMediaUrl,
} from "@pi-dash/shared/media-url";
import { createServerFn } from "@tanstack/react-start";
import { uuidv7 } from "uuidv7";
import z from "zod";

import { runSessionAuditedAction } from "@/lib/audit";
import { HttpError } from "@/lib/http-error";
import { publishImageUpload } from "@/lib/image-upload";
import {
  approvalScreenshotUploadSchema,
  avatarUploadSchema,
  eventEditorUploadSchema,
  eventPhotoUploadSchema,
  grantAgreementUploadSchema,
  kalakritiEntryMusicUploadSchema,
  kalakritiInventoryPhotoUploadSchema,
  kalakritiScorecardUploadSchema,
  requestUploadSchema,
  scheduledMessageUploadSchema,
  vendorPaymentInvoiceUploadSchema,
} from "@/lib/media-upload";
import {
  authorizeEventEditorUpload,
  authorizeProtectedUpload,
  PrivateMediaAccessError,
  type ProtectedUploadScope,
} from "@/lib/private-media-access";
import { defaultPrivateMediaAccessDeps } from "@/lib/private-media-db";
import { checkRateLimit } from "@/lib/rate-limit";
import { getS3 } from "@/lib/s3";
import { authorizeKalakritiEntryMusicUpload } from "@/lib/server/kalakriti-entry-music";
import { authorizeKalakritiInventoryPhotoUpload } from "@/lib/server/kalakriti-inventory-photo";
import { authorizeKalakritiScorecardUpload } from "@/lib/server/kalakriti-scorecard";
import {
  buildTemporaryUploadKey,
  createTemporaryUpload,
  deleteOwnedTemporaryUpload,
  type ProtectedUploadSubfolder,
} from "@/lib/temporary-upload";
import { authMiddleware } from "@/middleware/auth";

export function toAllowedMimeType(value: string): AllowedMimeType {
  if (!ALLOWED_MIME_TYPES.includes(value as AllowedMimeType)) {
    throw new HttpError(400, `Unsupported file type: ${value}`);
  }
  return value as AllowedMimeType;
}

const R2_SUBFOLDERS = {
  avatars: "avatars",
  updates: "updates",
} as const;

function assertImageUploadRateLimit(
  userId: string,
  surface: "avatars" | "updates",
  action: "sign" | "finalize"
): void {
  const limit = surface === "avatars" ? 20 : 100;
  if (
    !checkRateLimit(
      `image-upload:${surface}:${action}:${userId}`,
      limit,
      60 * 60 * 1000
    ).allowed
  ) {
    throw new HttpError(429, "Too many image uploads. Try again later.");
  }
}

const presignProtectedUpload = (input: {
  fileName: string;
  keyPrefix: string;
  mimeType: string;
  scope: ProtectedUploadScope;
  subfolder: ProtectedUploadSubfolder;
  user: { id: string; role?: null | string };
}) =>
  createTemporaryUpload(input, {
    authorize: (user, scope) =>
      authorizeProtectedUpload({ user }, scope, defaultPrivateMediaAccessDeps),
    presign: async (key, mimeType) => {
      const s3 = await getS3();
      return s3.presign(key, {
        expiresIn: 300,
        method: "PUT",
        type: mimeType,
      });
    },
  });

export const getRequestUploadUrl = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(requestUploadSchema)
  .handler(async ({ data, context }) => {
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
    }
    try {
      return await presignProtectedUpload({
        ...data,
        keyPrefix: env.R2_KEY_PREFIX,
        scope: { kind: "request" },
        subfolder: "attachments",
        user: context.session.user,
      });
    } catch (error) {
      logErrorAndRethrow(
        { method: "POST", path: "/fn/getRequestUploadUrl" },
        {
          fileName: data.fileName,
          fileSize: data.fileSize,
          handler: "getRequestUploadUrl",
          mimeType: data.mimeType,
          userId: context.session.user.id,
        },
        error
      );
    }
  });

export const getVendorPaymentInvoiceUploadUrl = createServerFn({
  method: "POST",
})
  .middleware([authMiddleware])
  .validator(vendorPaymentInvoiceUploadSchema)
  .handler(async ({ data, context }) => {
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
    }
    try {
      return await presignProtectedUpload({
        ...data,
        keyPrefix: env.R2_KEY_PREFIX,
        scope: {
          kind: "vendorPaymentInvoice",
          vendorPaymentId: data.vendorPaymentId,
        },
        subfolder: "attachments",
        user: context.session.user,
      });
    } catch (error) {
      logErrorAndRethrow(
        { method: "POST", path: "/fn/getVendorPaymentInvoiceUploadUrl" },
        {
          fileName: data.fileName,
          fileSize: data.fileSize,
          handler: "getVendorPaymentInvoiceUploadUrl",
          mimeType: data.mimeType,
          userId: context.session.user.id,
          vendorPaymentId: data.vendorPaymentId,
        },
        error
      );
    }
  });

export const getGrantAgreementUploadUrl = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(grantAgreementUploadSchema)
  .handler(async ({ data, context }) => {
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
    }
    try {
      return await presignProtectedUpload({
        ...data,
        keyPrefix: env.R2_KEY_PREFIX,
        scope: { kind: "grantAgreement" },
        subfolder: "attachments",
        user: context.session.user,
      });
    } catch (error) {
      logErrorAndRethrow(
        { method: "POST", path: "/fn/getGrantAgreementUploadUrl" },
        {
          fileName: data.fileName,
          fileSize: data.fileSize,
          handler: "getGrantAgreementUploadUrl",
          mimeType: data.mimeType,
          userId: context.session.user.id,
        },
        error
      );
    }
  });

export const getApprovalScreenshotUploadUrl = createServerFn({
  method: "POST",
})
  .middleware([authMiddleware])
  .validator(approvalScreenshotUploadSchema)
  .handler(async ({ data, context }) => {
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
    }
    try {
      return await presignProtectedUpload({
        ...data,
        keyPrefix: env.R2_KEY_PREFIX,
        scope: { kind: "approvalScreenshot" },
        subfolder: "approval-screenshots",
        user: context.session.user,
      });
    } catch (error) {
      logErrorAndRethrow(
        { method: "POST", path: "/fn/getApprovalScreenshotUploadUrl" },
        {
          fileName: data.fileName,
          fileSize: data.fileSize,
          handler: "getApprovalScreenshotUploadUrl",
          mimeType: data.mimeType,
          userId: context.session.user.id,
        },
        error
      );
    }
  });

export const getEventPhotoUploadUrl = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(eventPhotoUploadSchema)
  .handler(async ({ data, context }) => {
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
    }
    try {
      return await presignProtectedUpload({
        ...data,
        keyPrefix: env.R2_KEY_PREFIX,
        scope: { eventId: data.eventId, kind: "eventPhoto" },
        subfolder: "photos",
        user: context.session.user,
      });
    } catch (error) {
      logErrorAndRethrow(
        { method: "POST", path: "/fn/getEventPhotoUploadUrl" },
        {
          eventId: data.eventId,
          fileName: data.fileName,
          fileSize: data.fileSize,
          handler: "getEventPhotoUploadUrl",
          mimeType: data.mimeType,
          userId: context.session.user.id,
        },
        error
      );
    }
  });

export const getScheduledMessageUploadUrl = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(scheduledMessageUploadSchema)
  .handler(async ({ data, context }) => {
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
    }
    try {
      return await presignProtectedUpload({
        ...data,
        keyPrefix: env.R2_KEY_PREFIX,
        scope: { kind: "scheduledMessage" },
        subfolder: "scheduled-messages",
        user: context.session.user,
      });
    } catch (error) {
      logErrorAndRethrow(
        { method: "POST", path: "/fn/getScheduledMessageUploadUrl" },
        {
          fileName: data.fileName,
          fileSize: data.fileSize,
          handler: "getScheduledMessageUploadUrl",
          mimeType: data.mimeType,
          userId: context.session.user.id,
        },
        error
      );
    }
  });

export const getKalakritiEntryMusicUploadUrl = createServerFn({
  method: "POST",
})
  .middleware([authMiddleware])
  .validator(kalakritiEntryMusicUploadSchema)
  .handler(async ({ data, context }) => {
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
    }
    try {
      return await createTemporaryUpload(
        {
          fileName: data.fileName,
          keyPrefix: env.R2_KEY_PREFIX,
          mimeType: data.mimeType,
          scope: {
            centerId: data.centerId,
            divisionId: data.divisionId,
            editionId: data.editionId,
            kind: "kalakritiEntryMusic",
          },
          subfolder: "kalakriti-music",
          user: context.session.user,
        },
        {
          authorize: async (user, scope) => {
            if (scope.kind !== "kalakritiEntryMusic") {
              throw new PrivateMediaAccessError(403, "Forbidden");
            }
            await authorizeKalakritiEntryMusicUpload({
              entryId: data.entryId,
              centerId: scope.centerId,
              divisionId: scope.divisionId,
              editionId: scope.editionId,
              user,
            });
          },
          presign: async (key, mimeType) => {
            const s3 = await getS3();
            return s3.presign(key, {
              expiresIn: 300,
              method: "PUT",
              type: mimeType,
            });
          },
        }
      );
    } catch (error) {
      logErrorAndRethrow(
        { method: "POST", path: "/fn/getKalakritiEntryMusicUploadUrl" },
        {
          editionId: data.editionId,
          fileName: data.fileName,
          fileSize: data.fileSize,
          handler: "getKalakritiEntryMusicUploadUrl",
          mimeType: data.mimeType,
          userId: context.session.user.id,
        },
        error
      );
    }
  });

export const getKalakritiScorecardUploadUrl = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(kalakritiScorecardUploadSchema)
  .handler(async ({ data, context }) => {
    if (!context.session) throw new HttpError(401, "Unauthorized");
    try {
      return await createTemporaryUpload(
        {
          fileName: data.fileName,
          keyPrefix: env.R2_KEY_PREFIX,
          mimeType: data.mimeType,
          scope: {
            divisionId: data.divisionId,
            editionId: data.editionId,
            kind: "kalakritiScorecard",
          },
          subfolder: "kalakriti-scorecards",
          user: context.session.user,
        },
        {
          authorize: async (user, scope) => {
            if (scope.kind !== "kalakritiScorecard") {
              throw new PrivateMediaAccessError(403, "Forbidden");
            }
            await authorizeKalakritiScorecardUpload({
              divisionId: scope.divisionId,
              editionId: scope.editionId,
              user,
            });
          },
          presign: async (key, mimeType) => {
            const s3 = await getS3();
            return s3.presign(key, {
              expiresIn: 300,
              method: "PUT",
              type: mimeType,
            });
          },
        }
      );
    } catch (error) {
      logErrorAndRethrow(
        { method: "POST", path: "/fn/getKalakritiScorecardUploadUrl" },
        {
          divisionId: data.divisionId,
          editionId: data.editionId,
          fileName: data.fileName,
          fileSize: data.fileSize,
          handler: "getKalakritiScorecardUploadUrl",
          mimeType: data.mimeType,
          userId: context.session.user.id,
        },
        error
      );
    }
  });

export const getKalakritiInventoryPhotoUploadUrl = createServerFn({
  method: "POST",
})
  .middleware([authMiddleware])
  .validator(kalakritiInventoryPhotoUploadSchema)
  .handler(async ({ data, context }) => {
    if (!context.session) throw new HttpError(401, "Unauthorized");
    try {
      return await createTemporaryUpload(
        {
          fileName: data.fileName,
          keyPrefix: env.R2_KEY_PREFIX,
          mimeType: data.mimeType,
          scope: { editionId: data.editionId, kind: "kalakritiInventoryPhoto" },
          subfolder: "kalakriti-inventory",
          user: context.session.user,
        },
        {
          authorize: async (user, scope) => {
            if (scope.kind !== "kalakritiInventoryPhoto") {
              throw new PrivateMediaAccessError(403, "Forbidden");
            }
            await authorizeKalakritiInventoryPhotoUpload({
              editionId: scope.editionId,
              user,
            });
          },
          presign: async (key, mimeType) => {
            const s3 = await getS3();
            return s3.presign(key, {
              expiresIn: 300,
              method: "PUT",
              type: mimeType,
            });
          },
        }
      );
    } catch (error) {
      logErrorAndRethrow(
        { method: "POST", path: "/fn/getKalakritiInventoryPhotoUploadUrl" },
        {
          editionId: data.editionId,
          fileName: data.fileName,
          fileSize: data.fileSize,
          handler: "getKalakritiInventoryPhotoUploadUrl",
          mimeType: data.mimeType,
          userId: context.session.user.id,
        },
        error
      );
    }
  });

export const deleteTemporaryUpload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ key: z.string().min(1) }))
  .handler(async ({ data, context }) => {
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
    }
    const { session } = context;
    return await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "asset.delete",
        metadata: { temporary: true },
        target: { type: "asset" },
      },
      async () => {
        try {
          const s3 = await getS3();
          await deleteOwnedTemporaryUpload(
            data.key,
            { keyPrefix: env.R2_KEY_PREFIX, userId: session.user.id },
            {
              deleteObject: (key) => s3.delete(key),
              withDeleteLock: withProtectedR2ObjectDeleteLock,
            }
          );
          return { success: true };
        } catch (error) {
          logErrorAndRethrow(
            { method: "POST", path: "/fn/deleteTemporaryUpload" },
            {
              handler: "deleteTemporaryUpload",
              key: data.key,
              userId: session.user.id,
            },
            error
          );
        }
      }
    );
  });

export const getProfilePictureUploadUrl = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(avatarUploadSchema)
  .handler(async ({ data, context }) => {
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
    }
    try {
      const s3 = await getS3();
      assertImageUploadRateLimit(context.session.user.id, "avatars", "sign");
      const key = buildTemporaryUploadKey({
        keyPrefix: env.R2_KEY_PREFIX,
        subfolder: "avatars",
        userId: context.session.user.id,
        fileName: data.fileName,
      });
      const presignedUrl = s3.presign(key, {
        expiresIn: 300,
        method: "PUT",
        type: data.mimeType,
      });
      return {
        key,
        presignedUrl,
      };
    } catch (error) {
      logErrorAndRethrow(
        { method: "POST", path: "/fn/getProfilePictureUploadUrl" },
        {
          fileName: data.fileName,
          fileSize: data.fileSize,
          handler: "getProfilePictureUploadUrl",
          mimeType: data.mimeType,
          userId: context.session.user.id,
        },
        error
      );
    }
  });

type EventEditorUploadData = z.infer<typeof eventEditorUploadSchema>;
type EventEditorUploadSession = Parameters<
  typeof authorizeEventEditorUpload
>[0];
type EventEditorS3 = Pick<Awaited<ReturnType<typeof getS3>>, "presign">;

interface EventEditorUploadDeps {
  authorize: (
    session: EventEditorUploadSession,
    eventId: string
  ) => Promise<unknown>;
  createId: () => string;
  getS3: () => EventEditorS3 | Promise<EventEditorS3>;
  keyPrefix: string;
}

export async function createEventEditorUpload(
  data: EventEditorUploadData,
  session: EventEditorUploadSession,
  deps: EventEditorUploadDeps
) {
  await deps.authorize(session, data.eventId);
  const s3 = await deps.getS3();
  const key = buildTemporaryUploadKey({
    keyPrefix: deps.keyPrefix,
    subfolder: "updates",
    userId: session.user.id,
    uploadId: deps.createId(),
    fileName: data.fileName,
  });
  const presignedUrl = s3.presign(key, {
    expiresIn: 300,
    method: "PUT",
    type: data.mimeType,
  });
  return {
    key,
    presignedUrl,
  };
}

export const getEventEditorUploadUrl = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(eventEditorUploadSchema)
  .handler(async ({ data, context }) => {
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
    }
    try {
      assertImageUploadRateLimit(context.session.user.id, "updates", "sign");
      return await createEventEditorUpload(data, context.session, {
        authorize: (session, eventId) =>
          authorizeEventEditorUpload(
            session,
            eventId,
            defaultPrivateMediaAccessDeps
          ),
        createId: uuidv7,
        getS3,
        keyPrefix: env.R2_KEY_PREFIX,
      });
    } catch (error) {
      logErrorAndRethrow(
        { method: "POST", path: "/fn/getEventEditorUploadUrl" },
        {
          eventId: data.eventId,
          fileName: data.fileName,
          fileSize: data.fileSize,
          handler: "getEventEditorUploadUrl",
          mimeType: data.mimeType,
          userId: context.session.user.id,
        },
        error
      );
    }
  });

export const finalizeProfilePictureUpload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ key: z.string().min(1).max(1024) }))
  .handler(async ({ data, context }) => {
    const { session } = context;
    if (!session) {
      throw new HttpError(401, "Unauthorized");
    }
    assertImageUploadRateLimit(session.user.id, "avatars", "finalize");
    return await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "account.profile_photo.validate",
        target: { id: session.user.id, type: "user" },
      },
      async () => {
        const { key } = await publishImageUpload({
          key: data.key,
          keyPrefix: env.R2_KEY_PREFIX,
          userId: session.user.id,
          scopeId: session.user.id,
          surface: "avatars",
        });
        return { key, url: buildAvatarMediaUrl(session.user.id, key) };
      }
    );
  });

export const finalizeEventEditorUpload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      key: z.string().min(1).max(1024),
      eventId: eventEditorUploadSchema.shape.eventId,
    })
  )
  .handler(async ({ data, context }) => {
    const { session } = context;
    if (!session) {
      throw new HttpError(401, "Unauthorized");
    }
    assertImageUploadRateLimit(session.user.id, "updates", "finalize");
    return await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "event.editor_image.validate",
        target: { id: data.eventId, type: "event" },
      },
      async () => {
        await authorizeEventEditorUpload(
          session,
          data.eventId,
          defaultPrivateMediaAccessDeps
        );
        const { key } = await publishImageUpload({
          key: data.key,
          keyPrefix: env.R2_KEY_PREFIX,
          userId: session.user.id,
          scopeId: data.eventId,
          surface: "updates",
        });
        return { key, url: buildEventUpdateMediaUrl(data.eventId, key) };
      }
    );
  });

export const deleteProfilePicture = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      key: z.string().min(1),
    })
  )
  .handler(async ({ data, context }) => {
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
    }
    const { session } = context;
    return await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "account.profile_photo.delete",
        target: { id: session.user.id, type: "user" },
      },
      async () => {
        const expectedPrefix = `${env.R2_KEY_PREFIX}/${R2_SUBFOLDERS.avatars}/${session.user.id}/`;
        if (!data.key.startsWith(expectedPrefix)) {
          throw new HttpError(403, "Forbidden");
        }
        try {
          const s3 = await getS3();
          await s3.delete(data.key);
          return { success: true };
        } catch (error) {
          logErrorAndRethrow(
            { method: "POST", path: "/fn/deleteProfilePicture" },
            {
              handler: "deleteProfilePicture",
              key: data.key,
              userId: session.user.id,
            },
            error
          );
        }
      }
    );
  });
