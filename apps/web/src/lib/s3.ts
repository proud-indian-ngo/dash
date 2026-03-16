import { env } from "@pi-dash/env/server";

export async function getS3() {
  const { S3Client } = await import("bun");
  return new S3Client({
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    accessKeyId: env.R2_ACCESS_KEY,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    bucket: env.R2_BUCKET_NAME,
  });
}
