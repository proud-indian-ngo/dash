import { env } from "@pi-dash/env/server";
import { createFileRoute } from "@tanstack/react-router";
import { createRequestLogger } from "evlog";
import { requireSession } from "@/lib/api-auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getS3 } from "@/lib/s3";

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
        const result = await requireSession(request);
        if (result.error) {
          return result.error;
        }

        const rl = checkRateLimit(`download:${result.session.user.id}`, 30);
        if (!rl.allowed) {
          return rateLimitResponse(rl);
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

        try {
          const s3 = await getS3();
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
        } catch (error) {
          const log = createRequestLogger({
            method: "GET",
            path: "/api/attachments/download",
          });
          log.set({ userId: result.session.user.id, key, fileName });
          log.error(error instanceof Error ? error : String(error));
          log.emit();
          return Response.json({ error: "Download failed" }, { status: 500 });
        }
      },
    },
  },
});
