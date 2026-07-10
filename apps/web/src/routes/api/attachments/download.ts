import {
  type AttachmentDownloadRef,
  isAssetId,
  isAttachmentDownloadKind,
} from "@pi-dash/shared/asset-ref";
import { createFileRoute } from "@tanstack/react-router";
import { createRequestLogger } from "evlog";
import { requireSession } from "@/lib/api-auth";
import {
  type AuthorizedR2ObjectDeps,
  resolveAuthorizedR2Object,
} from "@/lib/authorized-r2-object";
import { R2ObjectAccessError } from "@/lib/r2-object-access";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getS3 } from "@/lib/s3";

export const parseAttachmentDownloadRef = (
  requestUrl: URL
): AttachmentDownloadRef | Response => {
  const id = requestUrl.searchParams.get("id")?.trim();
  const kind = requestUrl.searchParams.get("kind")?.trim() ?? null;

  if (!id) {
    return Response.json({ error: "Missing id" }, { status: 400 });
  }
  if (!isAssetId(id)) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }
  if (!isAttachmentDownloadKind(kind)) {
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

type Session = Parameters<typeof resolveAuthorizedR2Object>[0];

export interface AttachmentDownloadHandlerDeps {
  checkRateLimit: typeof checkRateLimit;
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  getS3: () => Pick<ReturnType<typeof getS3>, "presign">;
  rateLimitResponse: typeof rateLimitResponse;
  requireSession: (
    request: Request
  ) => Promise<{ session: Session } | { error: Response }>;
  resolveAuthorizedR2Object: (
    session: Session,
    ref: AttachmentDownloadRef,
    deps?: AuthorizedR2ObjectDeps
  ) => ReturnType<typeof resolveAuthorizedR2Object>;
}

const defaultHandlerDeps: AttachmentDownloadHandlerDeps = {
  checkRateLimit,
  fetch,
  getS3,
  rateLimitResponse,
  requireSession,
  resolveAuthorizedR2Object,
};

const sanitizeFileName = (input: string): string =>
  input
    .trim()
    .replaceAll(/[\r\n]/g, "")
    .replaceAll(/[\\/]/g, "-")
    .replaceAll(/"/g, "");

const INLINE_MEDIA_TYPES = new Set([
  "application/pdf",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
]);

const NON_PRINTABLE_ASCII = /[^\x20-\x7e]/gu;
const RFC5987_SPECIAL_CHARS = /['()*]/g;

const encodeRfc5987 = (value: string): string =>
  encodeURIComponent(value).replace(
    RFC5987_SPECIAL_CHARS,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );

const getContentDisposition = (
  requestUrl: URL,
  contentType: string,
  fileName: string
): string => {
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();
  const disposition =
    requestUrl.searchParams.get("disposition") === "inline" &&
    mediaType &&
    INLINE_MEDIA_TYPES.has(mediaType)
      ? "inline"
      : "attachment";
  const asciiFileName = fileName.replace(NON_PRINTABLE_ASCII, "_");
  const fallback = asciiFileName || "attachment";
  if (fallback === fileName) {
    return `${disposition}; filename="${fallback}"`;
  }
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encodeRfc5987(fileName)}`;
};

const getPrivateProxyHeaders = (upstream: Response): Headers => {
  const headers = new Headers({
    "Cache-Control": "private, max-age=0, no-store",
    Vary: "Cookie",
    "X-Content-Type-Options": "nosniff",
  });
  for (const name of ["accept-ranges", "content-length", "content-range"]) {
    const value = upstream.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  }
  return headers;
};

export async function handleAttachmentDownloadRequest(
  request: Request,
  deps = defaultHandlerDeps
): Promise<Response> {
  const requestUrl = new URL(request.url);
  const result = await deps.requireSession(request);
  if ("error" in result) {
    return result.error;
  }
  const ref = parseAttachmentDownloadRef(requestUrl);
  if (ref instanceof Response) {
    return ref;
  }
  const rateLimit = deps.checkRateLimit(
    `download:${result.session.user.id}`,
    30
  );
  if (!rateLimit.allowed) {
    return deps.rateLimitResponse(rateLimit);
  }
  let resolved: Awaited<ReturnType<typeof resolveAuthorizedR2Object>>;
  try {
    resolved = await deps.resolveAuthorizedR2Object(result.session, ref);
  } catch (error) {
    if (error instanceof R2ObjectAccessError) {
      return Response.json(
        { error: error.status === 403 ? "Forbidden" : "Asset not found" },
        { status: error.status }
      );
    }
    throw error;
  }
  const fileName = sanitizeFileName(resolved.filename) || "attachment";

  try {
    const s3 = deps.getS3();
    const downloadUrl = s3.presign(resolved.key, {
      expiresIn: 120,
      method: "GET",
    });
    const range = request.headers.get("range");
    const upstream = await deps.fetch(
      downloadUrl,
      range ? { headers: { Range: range } } : undefined
    );
    if (upstream.status === 416) {
      return new Response(null, {
        headers: getPrivateProxyHeaders(upstream),
        status: 416,
      });
    }
    if (!upstream.ok) {
      return Response.json({ error: "Asset not found" }, { status: 404 });
    }
    const contentType =
      upstream.headers.get("content-type") ?? "application/octet-stream";
    const responseHeaders = getPrivateProxyHeaders(upstream);
    responseHeaders.set(
      "Content-Disposition",
      getContentDisposition(requestUrl, contentType, fileName)
    );
    responseHeaders.set("Content-Type", contentType);
    return new Response(upstream.body, {
      headers: responseHeaders,
      status: upstream.status,
    });
  } catch (error) {
    const log = createRequestLogger({
      method: "GET",
      path: "/api/attachments/download",
    });
    log.set({
      assetId: ref.id,
      assetKind: ref.kind,
      key: resolved.key,
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
