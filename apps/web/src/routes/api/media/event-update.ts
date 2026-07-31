import { isAssetId } from "@pi-dash/shared/asset-ref";
import { createFileRoute } from "@tanstack/react-router";
import { createRequestLogger } from "evlog";
import { requireSession } from "@/lib/api-auth";
import {
  PrivateMediaAccessError,
  resolveEventUpdateMedia,
} from "@/lib/private-media-access";
import { defaultPrivateMediaAccessDeps } from "@/lib/private-media-db";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getS3 } from "@/lib/s3";

type Session = Parameters<typeof resolveEventUpdateMedia>[0];

export interface EventUpdateMediaHandlerDeps {
  checkRateLimit: typeof checkRateLimit;
  getS3: () => Pick<ReturnType<typeof getS3>, "presign">;
  rateLimitResponse: typeof rateLimitResponse;
  requireSession: (
    request: Request
  ) => Promise<{ session: Session } | { error: Response }>;
  resolveEventUpdateMedia: typeof resolveEventUpdateMedia;
}

const defaultHandlerDeps: EventUpdateMediaHandlerDeps = {
  checkRateLimit,
  getS3,
  rateLimitResponse,
  requireSession,
  resolveEventUpdateMedia,
};

export async function handleEventUpdateMediaRequest(
  request: Request,
  deps = defaultHandlerDeps
): Promise<Response> {
  const authResult = await deps.requireSession(request);
  if ("error" in authResult) {
    return authResult.error;
  }
  const requestUrl = new URL(request.url);
  const eventId = requestUrl.searchParams.get("eventId")?.trim();
  const key = requestUrl.searchParams.get("key")?.trim();
  if (!(eventId && isAssetId(eventId) && key)) {
    return Response.json({ error: "Invalid media reference" }, { status: 400 });
  }
  const rateLimit = deps.checkRateLimit(
    `private-media:${authResult.session.user.id}`,
    300
  );
  if (!rateLimit.allowed) {
    return deps.rateLimitResponse(rateLimit);
  }

  let resolved: Awaited<ReturnType<typeof resolveEventUpdateMedia>>;
  try {
    resolved = await deps.resolveEventUpdateMedia(
      authResult.session,
      { eventId, key },
      defaultPrivateMediaAccessDeps
    );
  } catch (error) {
    if (error instanceof PrivateMediaAccessError) {
      return Response.json(
        { error: error.status === 403 ? "Forbidden" : "Media not found" },
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
      path: "/api/media/event-update",
    });
    log.set({ eventId, key, userId: authResult.session.user.id });
    log.error(error instanceof Error ? error : String(error));
    log.emit();
    return Response.json({ error: "Media unavailable" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/media/event-update")({
  server: {
    handlers: {
      GET: async ({ request }) => handleEventUpdateMediaRequest(request),
    },
  },
});
