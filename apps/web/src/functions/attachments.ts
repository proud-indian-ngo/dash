import { env } from "@pi-dash/env/server";
import { logErrorAndRethrow } from "@pi-dash/observability";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_SIZE_BYTES,
  MAX_VIDEO_SIZE_BYTES,
} from "@pi-dash/shared/constants";
import { createServerFn } from "@tanstack/react-start";
import { uuidv7 } from "uuidv7";
import z from "zod";
import {
  assertCanDeleteTemporaryUpload,
  assertCanUploadEventScopedObject,
  assertCanUploadScheduledMessageObject,
  R2ObjectAccessError,
} from "@/lib/authorized-r2-object";
import { MAX_ATTACHMENT_FILE_SIZE_BYTES } from "@/lib/form-schemas";
import { getS3 } from "@/lib/s3";
import { authMiddleware } from "@/middleware/auth";

export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/heic",
  "image/heif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
  "video/mp4",
  "video/quicktime",
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export function toAllowedMimeType(value: string): AllowedMimeType {
  if (!ALLOWED_MIME_TYPES.includes(value as AllowedMimeType)) {
    throw new Error(`Unsupported file type: ${value}`);
  }
  return value as AllowedMimeType;
}

const R2_SUBFOLDERS = {
  approvalScreenshots: "approval-screenshots",
  attachments: "attachments",
  avatars: "avatars",
  photos: "photos",
  scheduledMessages: "scheduled-messages",
  updates: "updates",
} as const;

const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

const EVENT_MEDIA_MIME_TYPES = [
  ...ALLOWED_IMAGE_TYPES,
  "video/mp4",
  "video/quicktime",
] as const;

export const MAX_AVATAR_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const sanitizeFileName = (fileName: string): string =>
  fileName
    .trim()
    .replaceAll(/[\r\n]/g, "")
    .replaceAll(/[\\/]/g, "-")
    .replaceAll(/"/g, "")
    .replaceAll(/\s+/g, "-");

const scheduledMessageUploadSchema = z.object({
  entityId: z.string().min(1),
  fileName: z.string().min(1),
  fileSize: z.number().int().positive().max(MAX_ATTACHMENT_FILE_SIZE_BYTES),
  mimeType: z.string().min(1),
});

export function buildScheduledMessageUploadKey(input: {
  entityId: string;
  fileName: string;
  uploadId?: string;
  userId: string;
}): string {
  const ownerSegment =
    input.entityId === "scheduled-message-draft"
      ? `tmp/${input.userId}`
      : input.entityId;
  const uploadId = input.uploadId ?? uuidv7();
  return `${env.R2_KEY_PREFIX}/${R2_SUBFOLDERS.scheduledMessages}/${ownerSegment}/${uploadId}-${sanitizeFileName(input.fileName)}`;
}

export interface ScheduledMessageUploadDeps {
  assertCanUploadScheduledMessageObject: typeof assertCanUploadScheduledMessageObject;
  getS3: () => Pick<ReturnType<typeof getS3>, "presign">;
}

const defaultScheduledMessageUploadDeps: ScheduledMessageUploadDeps = {
  assertCanUploadScheduledMessageObject,
  getS3,
};

export async function createScheduledMessageUpload(
  data: z.infer<typeof scheduledMessageUploadSchema>,
  session: { user: { id: string; role?: null | string } },
  deps = defaultScheduledMessageUploadDeps
) {
  await deps.assertCanUploadScheduledMessageObject(session);
  const s3 = await deps.getS3();
  const key = buildScheduledMessageUploadKey({
    entityId: data.entityId,
    fileName: data.fileName,
    userId: session.user.id,
  });
  const presignedUrl = s3.presign(key, {
    expiresIn: 300,
    method: "PUT",
    type: data.mimeType,
  });
  return { key, presignedUrl };
}

const eventPhotoUploadSchema = z
  .object({
    eventId: z.string().min(1),
    fileName: z.string().min(1),
    fileSize: z.number().int().positive(),
    mimeType: z.enum(EVENT_MEDIA_MIME_TYPES),
  })
  .superRefine((data, ctx) => {
    const maxBytes = data.mimeType.startsWith("video/")
      ? MAX_VIDEO_SIZE_BYTES
      : MAX_IMAGE_SIZE_BYTES;
    if (data.fileSize > maxBytes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: data.mimeType.startsWith("video/")
          ? `Video exceeds ${MAX_VIDEO_SIZE_BYTES / 1024 / 1024} MB limit`
          : `File exceeds ${MAX_IMAGE_SIZE_BYTES / 1024 / 1024} MB limit`,
        path: ["fileSize"],
      });
    }
  });

const editorImageUploadSchema = z.object({
  eventId: z.string().min(1),
  fileName: z.string().min(1),
  fileSize: z.number().int().positive().max(MAX_IMAGE_SIZE_BYTES),
  mimeType: z.enum(ALLOWED_IMAGE_TYPES),
});

export const getPresignedUploadUrl = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z
      .object({
        entityId: z.string().min(1),
        fileName: z.string().min(1),
        fileSize: z.number().int().positive(),
        mimeType: z.string().min(1),
        subfolder: z.enum([
          R2_SUBFOLDERS.attachments,
          R2_SUBFOLDERS.approvalScreenshots,
        ]),
      })
      .refine(
        (data) =>
          (ALLOWED_MIME_TYPES as readonly string[]).includes(data.mimeType),
        {
          message: "File type not allowed for this subfolder",
          path: ["mimeType"],
        }
      )
      .superRefine((data, ctx) => {
        const maxBytes = data.mimeType.startsWith("video/")
          ? MAX_VIDEO_SIZE_BYTES
          : MAX_ATTACHMENT_FILE_SIZE_BYTES;
        if (data.fileSize > maxBytes) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: data.mimeType.startsWith("video/")
              ? `Video exceeds ${MAX_VIDEO_SIZE_BYTES / 1024 / 1024} MB limit`
              : `File exceeds ${MAX_ATTACHMENT_FILE_SIZE_BYTES / 1024 / 1024} MB limit`,
            path: ["fileSize"],
          });
        }
      })
  )
  .handler(async ({ data, context }) => {
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    try {
      const s3 = await getS3();
      const key = `${env.R2_KEY_PREFIX}/${data.subfolder}/tmp/${context.session.user.id}/${uuidv7()}-${sanitizeFileName(data.fileName)}`;
      // NOTE: Bun's S3.presign() does not support content-length conditions.
      // fileSize is validated by Zod above but cannot be enforced at the storage layer.
      // To enforce upload size, switch to @aws-sdk/s3-request-presigner with
      // createPresignedPost and a ["content-length-range", 1, MAX] condition.
      const presignedUrl = s3.presign(key, {
        expiresIn: 300,
        method: "PUT",
        type: data.mimeType,
      });
      return { key, presignedUrl };
    } catch (error) {
      logErrorAndRethrow(
        { method: "POST", path: "/fn/getPresignedUploadUrl" },
        {
          entityId: data.entityId,
          fileName: data.fileName,
          fileSize: data.fileSize,
          handler: "getPresignedUploadUrl",
          mimeType: data.mimeType,
          subfolder: data.subfolder,
          userId: context.session?.user.id,
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
      await assertCanUploadEventScopedObject(
        context.session,
        data.eventId,
        "events.manage_photos"
      );
      const s3 = await getS3();
      const key = `${env.R2_KEY_PREFIX}/${R2_SUBFOLDERS.photos}/${data.eventId}/${uuidv7()}-${sanitizeFileName(data.fileName)}`;
      const presignedUrl = s3.presign(key, {
        expiresIn: 300,
        method: "PUT",
        type: data.mimeType,
      });
      return { key, presignedUrl };
    } catch (error) {
      if (error instanceof R2ObjectAccessError) {
        throw new Error(
          error.status === 403 ? "Forbidden" : "Event not found",
          { cause: error }
        );
      }
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
      return await createScheduledMessageUpload(data, context.session);
    } catch (error) {
      if (error instanceof R2ObjectAccessError) {
        throw new Error(error.status === 403 ? "Forbidden" : "Not found", {
          cause: error,
        });
      }
      logErrorAndRethrow(
        { method: "POST", path: "/fn/getScheduledMessageUploadUrl" },
        {
          entityId: data.entityId,
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

export const getEditorImageUploadUrl = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(editorImageUploadSchema)
  .handler(async ({ data, context }) => {
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    try {
      await assertCanUploadEventScopedObject(
        context.session,
        data.eventId,
        "event_updates.create"
      );
      const s3 = await getS3();
      const key = `${env.R2_KEY_PREFIX}/${R2_SUBFOLDERS.updates}/${data.eventId}/${uuidv7()}-${sanitizeFileName(data.fileName)}`;
      const presignedUrl = s3.presign(key, {
        expiresIn: 300,
        method: "PUT",
        type: data.mimeType,
      });
      return { key, presignedUrl };
    } catch (error) {
      if (error instanceof R2ObjectAccessError) {
        throw new Error(
          error.status === 403 ? "Forbidden" : "Event not found",
          { cause: error }
        );
      }
      logErrorAndRethrow(
        { method: "POST", path: "/fn/getEditorImageUploadUrl" },
        {
          eventId: data.eventId,
          fileName: data.fileName,
          fileSize: data.fileSize,
          handler: "getEditorImageUploadUrl",
          mimeType: data.mimeType,
          userId: context.session.user.id,
        },
        error
      );
    }
  });

export const deleteUploadedAsset = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      key: z.string().startsWith(`${env.R2_KEY_PREFIX}/`),
      subfolder: z.enum([
        R2_SUBFOLDERS.attachments,
        R2_SUBFOLDERS.approvalScreenshots,
        R2_SUBFOLDERS.photos,
        R2_SUBFOLDERS.scheduledMessages,
        R2_SUBFOLDERS.updates,
      ]),
    })
  )
  .handler(async ({ data, context }) => {
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    try {
      const resolved = assertCanDeleteTemporaryUpload(context.session, {
        key: data.key,
        subfolder: data.subfolder,
      });
      const s3 = await getS3();
      await s3.delete(resolved.key);
      return { success: true };
    } catch (error) {
      if (error instanceof R2ObjectAccessError) {
        throw new Error(
          error.status === 403 ? "Forbidden" : "Asset not found",
          { cause: error }
        );
      }
      logErrorAndRethrow(
        { method: "POST", path: "/fn/deleteUploadedAsset" },
        {
          handler: "deleteUploadedAsset",
          key: data.key,
          subfolder: data.subfolder,
          userId: context.session.user.id,
        },
        error
      );
    }
  });

export const getProfilePictureUploadUrl = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      fileName: z.string().min(1),
      fileSize: z.number().int().positive().max(MAX_AVATAR_FILE_SIZE_BYTES),
      mimeType: z.enum(ALLOWED_IMAGE_MIME_TYPES),
    })
  )
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
      return { key, presignedUrl };
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
    const expectedPrefix = `${env.R2_KEY_PREFIX}/${R2_SUBFOLDERS.avatars}/${context.session.user.id}/`;
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
          userId: context.session.user.id,
        },
        error
      );
    }
  });
