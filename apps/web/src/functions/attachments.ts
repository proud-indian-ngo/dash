import { env } from "@pi-dash/env/server";
import { createServerFn } from "@tanstack/react-start";
import { S3Client } from "bun";
import z from "zod";
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

function getS3() {
  return new S3Client({
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_KEY_ID,
    bucket: env.R2_BUCKET_NAME,
  });
}

export const getPresignedUploadUrl = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      fileName: z.string().min(1),
      mimeType: z.enum(ALLOWED_MIME_TYPES),
    })
  )
  .handler(({ data }) => {
    const s3 = getS3();
    const sanitizedFileName = data.fileName
      .trim()
      .replaceAll(/[\r\n]/g, "")
      .replaceAll(/[\\/]/g, "-")
      .replaceAll(/"/g, "")
      .replaceAll(/\s+/g, "-");
    const key = `${env.ASSET_FOLDER}/${crypto.randomUUID()}-${sanitizedFileName}`;
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
      key: z.string().startsWith(`${env.ASSET_FOLDER}/`),
    })
  )
  .handler(async ({ data }) => {
    const s3 = getS3();
    await s3.delete(data.key);
    return { success: true };
  });

export const deleteUploadedAssets = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      keys: z.array(z.string().startsWith(`${env.ASSET_FOLDER}/`)),
    })
  )
  .handler(async ({ data }) => {
    const s3 = getS3();
    await Promise.all(data.keys.map((key) => s3.delete(key)));
    return { success: true };
  });
