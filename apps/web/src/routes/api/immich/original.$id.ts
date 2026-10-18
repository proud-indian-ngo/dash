// biome-ignore-all lint/style/useFilenamingConvention: TanStack dynamic route parameters use $ in filenames.
import { isAssetId } from "@pi-dash/shared/asset-ref";
import { createFileRoute } from "@tanstack/react-router";
import { createRequestLogger } from "evlog";

import { requireSession } from "@/lib/api-auth";
import {
  type AuthorizedEventPhotoDeps,
  resolveAuthorizedEventPhoto,
} from "@/lib/authorized-r2-object";
import { fetchImmichOriginal, getImmichConfig } from "@/lib/immich";
import { R2ObjectAccessError } from "@/lib/r2-object-access";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

type Session = Parameters<typeof resolveAuthorizedEventPhoto>[0];

export interface ImmichOriginalHandlerDeps {
  checkRateLimit: typeof checkRateLimit;
  fetchImmichOriginal: typeof fetchImmichOriginal;
  getImmichConfig: typeof getImmichConfig;
  rateLimitResponse: typeof rateLimitResponse;
  requireSession: (
    request: Request
  ) => Promise<{ session: Session } | { error: Response }>;
  resolveAuthorizedEventPhoto: (
    session: Session,
    photoId: string,
    deps?: AuthorizedEventPhotoDeps
  ) => ReturnType<typeof resolveAuthorizedEventPhoto>;
}

const defaultHandlerDeps: ImmichOriginalHandlerDeps = {
  checkRateLimit,
  fetchImmichOriginal,
  getImmichConfig,
  rateLimitResponse,
  requireSession,
  resolveAuthorizedEventPhoto,
};

export async function handleImmichOriginalRequest(
  request: Request,
  photoId: string,
  deps = defaultHandlerDeps
): Promise<Response> {
  const result = await deps.requireSession(request);
  if ("error" in result) {
    return result.error;
  }
  if (!isAssetId(photoId)) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }
  const userRateLimit = deps.checkRateLimit(
    `event-media:${result.session.user.id}`,
    3000
  );
  if (!userRateLimit.allowed) {
    return deps.rateLimitResponse(userRateLimit);
  }
  const photoRateLimit = deps.checkRateLimit(
    `event-media:${result.session.user.id}:${photoId}`,
    30
  );
  if (!photoRateLimit.allowed) {
    return deps.rateLimitResponse(photoRateLimit);
  }

  let immichAssetId: null | string;
  try {
    ({ immichAssetId } = await deps.resolveAuthorizedEventPhoto(
      result.session,
      photoId
    ));
  } catch (error) {
    if (error instanceof R2ObjectAccessError) {
      return Response.json(
        { error: error.status === 403 ? "Forbidden" : "Photo not found" },
        { status: error.status }
      );
    }
    throw error;
  }
  if (!immichAssetId) {
    return Response.json({ error: "Photo not found" }, { status: 404 });
  }

  const config = deps.getImmichConfig();
  if (!config) {
    return Response.json({ error: "Immich not configured" }, { status: 503 });
  }

  try {
    const rangeHeader = request.headers.get("Range");
    const upstream = await deps.fetchImmichOriginal(
      config,
      immichAssetId,
      rangeHeader
    );
    const contentType =
      upstream.headers.get("content-type") ?? "application/octet-stream";
    const headers: Record<string, string> = {
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=0, no-store",
      "Content-Type": contentType,
      Vary: "Cookie",
      "X-Content-Type-Options": "nosniff",
    };

    const contentLength = upstream.headers.get("content-length");
    if (contentLength) {
      headers["Content-Length"] = contentLength;
    }
    const contentRange = upstream.headers.get("content-range");
    if (contentRange) {
      headers["Content-Range"] = contentRange;
    }

    return new Response(upstream.body, {
      headers,
      status: upstream.status,
    });
  } catch (caughtError) {
    const log = createRequestLogger({
      method: "GET",
      path: "/api/immich/original/$id",
    });
    log.set({ immichAssetId, photoId, userId: result.session.user.id });
    log.error(caughtError instanceof Error ? caughtError : String(caughtError));
    log.emit();
    return Response.json(
      { caughtError: "Failed to fetch original image" },
      { status: 502 }
    );
  }
}

export const Route = createFileRoute("/api/immich/original/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        handleImmichOriginalRequest(request, params.id),
    },
  },
});
