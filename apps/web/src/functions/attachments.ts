import { env } from "@pi-dash/env/server";
import { createServerFn } from "@tanstack/react-start";
import { uuidv7 } from "uuidv7";
import z from "zod";
import { MAX_ATTACHMENT_FILE_SIZE_BYTES } from "@/lib/form-schemas";
import { getS3 } from "@/lib/s3";
import { authMiddleware } from "@/middleware/auth";

export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

const R2_SUBFOLDERS = {
  attachments: "attachments",
  avatars: "avatars",
  photos: "photos",
  updates: "updates",
} as const;

const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

export const MAX_AVATAR_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const sanitizeFileName = (fileName: string): string =>
  fileName
    .trim()
    .replaceAll(/[\r\n]/g, "")
    .replaceAll(/[\\/]/g, "-")
    .replaceAll(/"/g, "")
    .replaceAll(/\s+/g, "-");

export const getPresignedUploadUrl = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      fileName: z.string().min(1),
      fileSize: z.number().int().positive().max(MAX_ATTACHMENT_FILE_SIZE_BYTES),
      mimeType: z.enum(ALLOWED_MIME_TYPES),
      subfolder: z.enum([
        R2_SUBFOLDERS.attachments,
        R2_SUBFOLDERS.photos,
        R2_SUBFOLDERS.updates,
      ]),
      entityId: z.string().min(1),
    })
  )
  .handler(async ({ data }) => {
    const s3 = await getS3();
    const key = `${env.R2_KEY_PREFIX}/${data.subfolder}/${data.entityId}/${uuidv7()}-${sanitizeFileName(data.fileName)}`;
    // NOTE: Bun's S3.presign() does not support content-length conditions.
    // fileSize is validated by Zod above but cannot be enforced at the storage layer.
    // To enforce upload size, switch to @aws-sdk/s3-request-presigner with
    // createPresignedPost and a ["content-length-range", 1, MAX] condition.
    const presignedUrl = s3.presign(key, {
      method: "PUT",
      expiresIn: 300,
      type: data.mimeType,
    });
    return { presignedUrl, key };
  });

export const deleteUploadedAsset = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      key: z.string().startsWith(`${env.R2_KEY_PREFIX}/`),
    })
  )
  .handler(async ({ data }) => {
    const s3 = await getS3();
    await s3.delete(data.key);
    return { success: true };
  });

export const getProfilePictureUploadUrl = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(
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
    const s3 = await getS3();
    const key = `${env.R2_KEY_PREFIX}/${R2_SUBFOLDERS.avatars}/${context.session.user.id}/${uuidv7()}-${sanitizeFileName(data.fileName)}`;
    const presignedUrl = s3.presign(key, {
      method: "PUT",
      expiresIn: 300,
      type: data.mimeType,
    });
    return { presignedUrl, key };
  });

export const deleteProfilePicture = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(
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
    const s3 = await getS3();
    await s3.delete(data.key);
    return { success: true };
  });

export const deleteUploadedAssets = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      keys: z.array(z.string().startsWith(`${env.R2_KEY_PREFIX}/`)),
    })
  )
  .handler(async ({ data }) => {
    const s3 = await getS3();
    await Promise.all(data.keys.map((key) => s3.delete(key)));
    return { success: true };
  });
