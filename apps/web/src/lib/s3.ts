import { env } from "@pi-dash/env/server";
import { S3Client } from "bun";

export function getS3() {
  return new S3Client({
    accessKeyId: env.R2_ACCESS_KEY,
    bucket: env.R2_BUCKET_NAME,
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  });
}
