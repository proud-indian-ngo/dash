import { env } from "@pi-dash/env/server";
import { logErrorAndRethrow } from "@pi-dash/observability";
import { MAX_VIDEO_SIZE_BYTES } from "@pi-dash/shared/constants";
import {
  buildAvatarMediaUrl,
  buildEventUpdateMediaUrl,
} from "@pi-dash/shared/media-url";
import { createServerFn } from "@tanstack/react-start";
import { uuidv7 } from "uuidv7";
import z from "zod";
import { MAX_ATTACHMENT_FILE_SIZE_BYTES } from "@/lib/form-schemas";
import {
  avatarUploadSchema,
  eventEditorUploadSchema,
} from "@/lib/media-upload";
import { authorizeEventEditorUpload } from "@/lib/private-media-access";
import { defaultPrivateMediaAccessDeps } from "@/lib/private-media-db";
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

const sanitizeFileName = (fileName: string): string =>
  fileName
    .trim()
    .replaceAll(/[\r\n]/g, "")
    .replaceAll(/[\\/]/g, "-")
    .replaceAll(/"/g, "")
    .replaceAll(/\s+/g, "-");

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
          R2_SUBFOLDERS.photos,
          R2_SUBFOLDERS.scheduledMessages,
          R2_SUBFOLDERS.approvalScreenshots,
        ]),
      })
      .refine(
        (data) =>
          data.subfolder === R2_SUBFOLDERS.scheduledMessages ||
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
    try {
      const s3 = await getS3();
      const key = `${env.R2_KEY_PREFIX}/${data.subfolder}/${data.entityId}/${uuidv7()}-${sanitizeFileName(data.fileName)}`;
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
      ]),
    })
  )
  .handler(async ({ data, context }) => {
    const expectedPrefix = `${env.R2_KEY_PREFIX}/${data.subfolder}/`;
    if (!data.key.startsWith(expectedPrefix)) {
      throw new Error("Forbidden");
    }
    try {
      const s3 = await getS3();
      await s3.delete(data.key);
      return { success: true };
    } catch (error) {
      logErrorAndRethrow(
        { method: "POST", path: "/fn/deleteUploadedAsset" },
        {
          handler: "deleteUploadedAsset",
          key: data.key,
          subfolder: data.subfolder,
          userId: context.session?.user.id,
        },
        error
      );
    }
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

export const getEventEditorUploadUrl = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(eventEditorUploadSchema)
  .handler(async ({ data, context }) => {
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    await authorizeEventEditorUpload(
      context.session,
      data.eventId,
      defaultPrivateMediaAccessDeps
    );
    try {
      const s3 = await getS3();
      const key = `${env.R2_KEY_PREFIX}/${R2_SUBFOLDERS.updates}/${data.eventId}/${uuidv7()}-${sanitizeFileName(data.fileName)}`;
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

export const deleteUploadedAssets = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      keys: z.array(z.string().startsWith(`${env.R2_KEY_PREFIX}/`)),
      subfolder: z.enum([
        R2_SUBFOLDERS.attachments,
        R2_SUBFOLDERS.approvalScreenshots,
        R2_SUBFOLDERS.photos,
        R2_SUBFOLDERS.scheduledMessages,
      ]),
    })
  )
  .handler(async ({ data, context }) => {
    const expectedPrefix = `${env.R2_KEY_PREFIX}/${data.subfolder}/`;
    for (const key of data.keys) {
      if (!key.startsWith(expectedPrefix)) {
        throw new Error("Forbidden");
      }
    }
    try {
      const s3 = await getS3();
      await Promise.all(data.keys.map((key) => s3.delete(key)));
      return { success: true };
    } catch (error) {
      logErrorAndRethrow(
        { method: "POST", path: "/fn/deleteUploadedAssets" },
        {
          handler: "deleteUploadedAssets",
          keyCount: data.keys.length,
          subfolder: data.subfolder,
          userId: context.session?.user.id,
        },
        error
      );
    }
  });
