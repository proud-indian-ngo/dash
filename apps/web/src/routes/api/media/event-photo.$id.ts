// biome-ignore-all lint/style/useFilenamingConvention: TanStack dynamic route parameters use $ in filenames.
import { isAssetId } from "@pi-dash/shared/asset-ref";
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

type Session = Parameters<typeof resolveAuthorizedR2Object>[0];

export interface EventPhotoHandlerDeps {
  checkRateLimit: typeof checkRateLimit;
  getS3: () => Pick<ReturnType<typeof getS3>, "presign">;
  rateLimitResponse: typeof rateLimitResponse;
  requireSession: (
    request: Request
  ) => Promise<{ session: Session } | { error: Response }>;
  resolveAuthorizedR2Object: (
    session: Session,
    ref: { id: string; kind: "eventPhoto" },
    deps?: AuthorizedR2ObjectDeps
  ) => ReturnType<typeof resolveAuthorizedR2Object>;
}

const defaultHandlerDeps: EventPhotoHandlerDeps = {
  checkRateLimit,
  getS3,
  rateLimitResponse,
  requireSession,
  resolveAuthorizedR2Object,
};

export async function handleEventPhotoRequest(
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
  const rateLimit = deps.checkRateLimit(
    `event-media:${result.session.user.id}`,
    300
  );
  if (!rateLimit.allowed) {
    return deps.rateLimitResponse(rateLimit);
  }

  let resolved: Awaited<ReturnType<typeof resolveAuthorizedR2Object>>;
  try {
    resolved = await deps.resolveAuthorizedR2Object(result.session, {
      id: photoId,
      kind: "eventPhoto",
    });
  } catch (error) {
    if (error instanceof R2ObjectAccessError) {
      return Response.json(
        { error: error.status === 403 ? "Forbidden" : "Photo not found" },
        { status: error.status }
      );
    }
    throw error;
  }

  try {
    const location = deps.getS3().presign(resolved.key, {
      expiresIn: 120,
      method: "GET",
    });
    return new Response(null, {
      headers: {
        "Cache-Control": "private, max-age=0, no-store",
        Location: location,
        Vary: "Cookie",
      },
      status: 302,
    });
  } catch (error) {
    const log = createRequestLogger({
      method: "GET",
      path: "/api/media/event-photo/$id",
    });
    log.set({
      key: resolved.key,
      photoId,
      userId: result.session.user.id,
    });
    log.error(error instanceof Error ? error : String(error));
    log.emit();
    return Response.json({ error: "Photo unavailable" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/media/event-photo/$id")({
  server: {
    handlers: {
      GET: async ({ params, request }) =>
        handleEventPhotoRequest(request, params.id),
    },
  },
});
