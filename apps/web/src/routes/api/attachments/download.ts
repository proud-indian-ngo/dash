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

const INLINE_CONTENT_TYPES = new Set([
  "image/gif",
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
]);

function normalizeContentType(value: string): string {
  return value.split(";")[0]?.trim().toLowerCase() ?? "";
}

function canRenderInline(contentType: string): boolean {
  return INLINE_CONTENT_TYPES.has(normalizeContentType(contentType));
}

function getDownloadRateLimit(
  kind: PersistedR2ObjectKind,
  userId: string
): { key: string; limit: number } {
  if (kind === "eventPhoto") {
    return { key: `download:eventPhoto:${userId}`, limit: 300 };
  }
  return { key: `download:${userId}`, limit: 30 };
}

function getCacheControl(kind: PersistedR2ObjectKind): string {
  return kind === "eventPhoto"
    ? "private, max-age=60"
    : "private, max-age=0, no-store";
}

export const parseDownloadTarget = (
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

export interface AttachmentDownloadHandlerDeps {
  assertCanDownloadR2Object: (
    session: Parameters<typeof assertCanDownloadR2Object>[0],
    input: PersistedR2ObjectInput
  ) => Promise<ResolvedR2Object>;
  checkRateLimit: typeof checkRateLimit;
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  getS3: () => Pick<ReturnType<typeof getS3>, "presign">;
  rateLimitResponse: typeof rateLimitResponse;
  requireSession: (request: Request) => Promise<
    | {
        error?: never;
        session: Parameters<typeof assertCanDownloadR2Object>[0];
      }
    | { error: Response; session?: never }
  >;
}

const defaultHandlerDeps: AttachmentDownloadHandlerDeps = {
  assertCanDownloadR2Object,
  checkRateLimit,
  fetch,
  getS3,
  rateLimitResponse,
  requireSession,
};

export async function handleAttachmentDownloadRequest(
  request: Request,
  deps = defaultHandlerDeps
): Promise<Response> {
  const result = await deps.requireSession(request);
  if (result.error) {
    return result.error;
  }

  const requestUrl = new URL(request.url);
  const target = parseDownloadTarget(requestUrl);
  if (target instanceof Response) {
    return target;
  }

  const rateLimit = getDownloadRateLimit(target.kind, result.session.user.id);
  const rl = deps.checkRateLimit(rateLimit.key, rateLimit.limit);
  if (!rl.allowed) {
    return deps.rateLimitResponse(rl);
  }

  const rawFileName =
    requestUrl.searchParams.get("filename")?.trim() || undefined;
  const requestedInline =
    requestUrl.searchParams.get("disposition") === "inline";
  let resolved: ResolvedR2Object;
  try {
    resolved = await deps.assertCanDownloadR2Object(result.session, target);
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
    const s3 = await deps.getS3();
    const downloadUrl = s3.presign(resolved.key, {
      expiresIn: 120,
      method: "GET",
    });

    const upstream = await deps.fetch(downloadUrl);
    if (!upstream.ok) {
      return Response.json({ error: "Asset not found" }, { status: 404 });
    }

    const contentType =
      upstream.headers.get("content-type") ?? "application/octet-stream";
    const contentDisposition =
      requestedInline && canRenderInline(contentType) ? "inline" : "attachment";

    return new Response(upstream.body, {
      headers: {
        "Cache-Control": getCacheControl(target.kind),
        "Content-Disposition": `${contentDisposition}; filename="${fileName}"`,
        "Content-Type": contentType,
        Vary: "Cookie",
        "X-Content-Type-Options": "nosniff",
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
}

export const Route = createFileRoute("/api/attachments/download")({
  server: {
    handlers: {
      GET: async ({ request }) => handleAttachmentDownloadRequest(request),
    },
  },
});
