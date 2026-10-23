import { env } from "@pi-dash/env/server";
import { S3Client } from "bun";

export function r2Credentials() {
  return {
    accessKeyId: env.R2_ACCESS_KEY,
    bucket: env.R2_BUCKET_NAME,
    endpoint:
      env.R2_ENDPOINT ??
      `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  };
}

export function getR2Client() {
  return new S3Client(r2Credentials());
}
