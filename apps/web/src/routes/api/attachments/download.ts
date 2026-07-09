import { createFileRoute } from "@tanstack/react-router";
import { createRequestLogger } from "evlog";
import { requireSession } from "@/lib/api-auth";
import {
  assertCanDownloadR2Object,
  type PersistedR2ObjectInput,
  type PersistedR2ObjectKind,
  persistedR2ObjectKindValues,
  R2ObjectAccessError,
  type ResolvedR2Object,
} from "@/lib/authorized-r2-object";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getS3 } from "@/lib/s3";

const sanitizeFileName = (input: string): string =>
  input
    .trim()
    .replaceAll(/[\r\n]/g, "")
    .replaceAll(/[\\/]/g, "-")
    .replaceAll(/"/g, "");

const isPersistedR2ObjectKind = (
  value: null | string
): value is PersistedR2ObjectKind =>
  persistedR2ObjectKindValues.includes(value as PersistedR2ObjectKind);

const parseDownloadTarget = (
  requestUrl: URL
): PersistedR2ObjectInput | Response => {
  const id = requestUrl.searchParams.get("id")?.trim();
  const kind = requestUrl.searchParams.get("kind")?.trim() ?? null;

  if (!id) {
    return Response.json({ error: "Missing id" }, { status: 400 });
  }
  if (!isPersistedR2ObjectKind(kind)) {
    return Response.json({ error: "Invalid kind" }, { status: 400 });
  }

  if (kind === "scheduledMessageAttachment") {
    const key = requestUrl.searchParams.get("key")?.trim();
    if (!key) {
      return Response.json({ error: "Missing key" }, { status: 400 });
    }
    return { id, key, kind };
  }

  return { id, kind };
};

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
        const target = parseDownloadTarget(requestUrl);
        if (target instanceof Response) {
          return target;
        }

        const rawFileName =
          requestUrl.searchParams.get("filename")?.trim() || undefined;
        let resolved: ResolvedR2Object;
        try {
          resolved = await assertCanDownloadR2Object(result.session, target);
        } catch (error) {
          if (error instanceof R2ObjectAccessError) {
            return Response.json(
              { error: error.status === 403 ? "Forbidden" : "Asset not found" },
              { status: error.status }
            );
          }
          throw error;
        }
        const fileName =
          sanitizeFileName(rawFileName ?? resolved.filename) || "attachment";

        try {
          const s3 = await getS3();
          const downloadUrl = s3.presign(resolved.key, {
            expiresIn: 120,
            method: "GET",
          });

          const upstream = await fetch(downloadUrl);
          if (!upstream.ok) {
            return Response.json({ error: "Asset not found" }, { status: 404 });
          }

          const contentType =
            upstream.headers.get("content-type") ?? "application/octet-stream";

          return new Response(upstream.body, {
            headers: {
              "Cache-Control": "private, max-age=0, no-store",
              "Content-Disposition": `attachment; filename="${fileName}"`,
              "Content-Type": contentType,
              Vary: "Cookie",
            },
            status: 200,
          });
        } catch (error) {
          const log = createRequestLogger({
            method: "GET",
            path: "/api/attachments/download",
          });
          log.set({
            fileName,
            key: resolved.key,
            kind: target.kind,
            objectId: target.id,
            userId: result.session.user.id,
          });
          log.error(error instanceof Error ? error : String(error));
          log.emit();
          return Response.json({ error: "Download failed" }, { status: 500 });
        }
      },
    },
  },
});
