// biome-ignore-all lint/style/useFilenamingConvention: TanStack dynamic route parameters use $ in filenames.
import { createFileRoute } from "@tanstack/react-router";
import { createRequestLogger } from "evlog";
import { requireSession } from "@/lib/api-auth";
import {
  PrivateMediaAccessError,
  resolveAvatarMedia,
} from "@/lib/private-media-access";
import { defaultPrivateMediaAccessDeps } from "@/lib/private-media-db";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getS3 } from "@/lib/s3";

interface Session {
  user: { id: string };
}

export interface AvatarMediaHandlerDeps {
  checkRateLimit: typeof checkRateLimit;
  getS3: () => Pick<ReturnType<typeof getS3>, "presign">;
  rateLimitResponse: typeof rateLimitResponse;
  requireSession: (
    request: Request
  ) => Promise<{ session: Session } | { error: Response }>;
  resolveAvatarMedia: typeof resolveAvatarMedia;
}

const defaultHandlerDeps: AvatarMediaHandlerDeps = {
  checkRateLimit,
  getS3,
  rateLimitResponse,
  requireSession,
  resolveAvatarMedia,
};

export async function handleAvatarMediaRequest(
  request: Request,
  userId: string,
  deps = defaultHandlerDeps
): Promise<Response> {
  const authResult = await deps.requireSession(request);
  if ("error" in authResult) {
    return authResult.error;
  }
  const key = new URL(request.url).searchParams.get("key")?.trim();
  if (!(userId.trim() && key)) {
    return Response.json({ error: "Invalid media reference" }, { status: 400 });
  }
  const rateLimit = deps.checkRateLimit(
    `private-media:${authResult.session.user.id}`,
    300
  );
  if (!rateLimit.allowed) {
    return deps.rateLimitResponse(rateLimit);
  }

  let resolved: Awaited<ReturnType<typeof resolveAvatarMedia>>;
  try {
    resolved = await deps.resolveAvatarMedia(
      { key, userId },
      defaultPrivateMediaAccessDeps
    );
  } catch (error) {
    if (error instanceof PrivateMediaAccessError) {
      return Response.json(
        { error: "Avatar not found" },
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
      path: "/api/media/avatar/$userId",
    });
    log.set({ key: resolved.key, userId });
    log.error(error instanceof Error ? error : String(error));
    log.emit();
    return Response.json({ error: "Avatar unavailable" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/media/avatar/$userId")({
  server: {
    handlers: {
      GET: async ({ params, request }) =>
        handleAvatarMediaRequest(request, params.userId),
    },
  },
});
