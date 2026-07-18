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
import {
  approvalScreenshotUploadSchema,
  avatarUploadSchema,
  eventEditorUploadSchema,
  eventPhotoUploadSchema,
  requestUploadSchema,
  scheduledMessageUploadSchema,
  vendorPaymentInvoiceUploadSchema,
} from "@/lib/media-upload";
import {
  authorizeEventEditorUpload,
  authorizeProtectedUpload,
  type ProtectedUploadScope,
} from "@/lib/private-media-access";
import { defaultPrivateMediaAccessDeps } from "@/lib/private-media-db";
import { getS3 } from "@/lib/s3";
import {
  createTemporaryUpload,
  deleteOwnedTemporaryUpload,
  type ProtectedUploadSubfolder,
} from "@/lib/temporary-upload";
import { authMiddleware } from "@/middleware/auth";

export function toAllowedMimeType(value: string): AllowedMimeType {
  if (!ALLOWED_MIME_TYPES.includes(value as AllowedMimeType)) {
    throw new Error(`Unsupported file type: ${value}`);
  }
  return value as AllowedMimeType;
}

const R2_SUBFOLDERS = {
  avatars: "avatars",
  updates: "updates",
} as const;

const sanitizeFileName = (fileName: string): string =>
  fileName
    .trim()
    .replaceAll(/[\r\n]/g, "")
    .replaceAll(/[\\/]/g, "-")
    .replaceAll(/"/g, "")
    .replaceAll(/\s+/g, "-");

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
      throw new Error("Unauthorized");
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
      throw new Error("Unauthorized");
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

export const getApprovalScreenshotUploadUrl = createServerFn({
  method: "POST",
})
  .middleware([authMiddleware])
  .validator(approvalScreenshotUploadSchema)
  .handler(async ({ data, context }) => {
    if (!context.session) {
      throw new Error("Unauthorized");
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
      throw new Error("Unauthorized");
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
      throw new Error("Unauthorized");
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

export const deleteTemporaryUpload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ key: z.string().min(1) }))
  .handler(async ({ data, context }) => {
    if (!context.session) {
      throw new Error("Unauthorized");
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
      throw new Error("Unauthorized");
    }
    try {
      const s3 = await getS3();
      const key = `${env.R2_KEY_PREFIX}/${R2_SUBFOLDERS.avatars}/${context.session.user.id}/${uuidv7()}-${sanitizeFileName(data.fileName)}`;
      const presignedUrl = s3.presign(key, {
        expiresIn: 300,
        method: "PUT",
        type: data.mimeType,
      });
      return {
        key,
        presignedUrl,
        url: buildAvatarMediaUrl(context.session.user.id, key),
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
  const key = `${deps.keyPrefix}/${R2_SUBFOLDERS.updates}/${data.eventId}/${deps.createId()}-${sanitizeFileName(data.fileName)}`;
  const presignedUrl = s3.presign(key, {
    expiresIn: 300,
    method: "PUT",
    type: data.mimeType,
  });
  return {
    key,
    presignedUrl,
    url: buildEventUpdateMediaUrl(data.eventId, key),
  };
}

export const getEventEditorUploadUrl = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(eventEditorUploadSchema)
  .handler(async ({ data, context }) => {
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    try {
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

export const deleteProfilePicture = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      key: z.string().min(1),
    })
  )
  .handler(async ({ data, context }) => {
    if (!context.session) {
      throw new Error("Unauthorized");
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
          throw new Error("Forbidden");
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
