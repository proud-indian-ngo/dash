import { env } from "@pi-dash/env/server";
import { createFileRoute } from "@tanstack/react-router";
import { S3Client } from "bun";
import { requireSession } from "@/lib/api-auth";

const getS3 = () =>
  new S3Client({
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    accessKeyId: env.R2_ACCESS_KEY,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    bucket: env.R2_BUCKET_NAME,
  });

const sanitizeFileName = (input: string): string =>
  input
    .trim()
    .replaceAll(/[\r\n]/g, "")
    .replaceAll(/[\\/]/g, "-")
    .replaceAll(/"/g, "");

export const Route = createFileRoute("/api/attachments/download")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { error } = await requireSession(request);
        if (error) {
          return error;
        }

        const requestUrl = new URL(request.url);
        const key = requestUrl.searchParams.get("key")?.trim();
        const rawFileName =
          requestUrl.searchParams.get("filename")?.trim() || "attachment";
        const fileName = sanitizeFileName(rawFileName) || "attachment";

        if (!key) {
          return Response.json({ error: "Missing key" }, { status: 400 });
        }

        const expectedPrefix = `${env.R2_KEY_PREFIX}/`;
        if (!key.startsWith(expectedPrefix)) {
          return Response.json({ error: "Invalid key" }, { status: 400 });
        }

        const s3 = getS3();
        const downloadUrl = s3.presign(key, {
          method: "GET",
          expiresIn: 120,
        });

        const upstream = await fetch(downloadUrl);
        if (!upstream.ok) {
          return Response.json({ error: "Asset not found" }, { status: 404 });
        }

        const contentType =
          upstream.headers.get("content-type") ?? "application/octet-stream";

        return new Response(upstream.body, {
          status: 200,
          headers: {
            "Cache-Control": "private, max-age=0, no-store",
            "Content-Disposition": `attachment; filename="${fileName}"`,
            "Content-Type": contentType,
            Vary: "Cookie",
          },
        });
      },
    },
  },
});
