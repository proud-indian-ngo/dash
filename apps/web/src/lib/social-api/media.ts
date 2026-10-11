import { getSocialPhotoAssetId } from "@pi-dash/db/queries/social-api";
import { env } from "@pi-dash/env/server";

import {
  fetchImmichOriginal,
  fetchImmichThumbnail,
  getImmichConfig,
} from "@/lib/immich";
import { socialJsonError } from "@/lib/social-api-auth";
import {
  isSocialMediaVariant,
  type SocialMediaVariant,
  verifySocialMediaSignature,
} from "@/lib/social-media-url";

import { socialServerError } from "./shared";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MEDIA_CACHE_CONTROL = "private, max-age=3600";

export interface SocialMediaDeps {
  /** Upstream Immich response for an asset; null when Immich is not configured. */
  fetchAsset:
    | ((assetId: string, variant: SocialMediaVariant) => Promise<Response>)
    | null;
  getSocialPhotoAssetId: typeof getSocialPhotoAssetId;
  now: () => number;
  signingSecret: string | undefined;
}

function defaultDeps(): SocialMediaDeps {
  const immich = getImmichConfig();
  return {
    fetchAsset: immich
      ? (assetId, variant) =>
          variant === "original"
            ? fetchImmichOriginal(immich, assetId)
            : fetchImmichThumbnail(immich, assetId)
      : null,
    getSocialPhotoAssetId,
    now: Date.now,
    signingSecret: env.SOCIAL_MEDIA_SIGNING_SECRET,
  };
}

/**
 * `GET /api/social/v1/media/{photoId}/{variant}?exp=&sig=`: token-free photo
 * proxy. The HMAC signature from the photos endpoint is the only credential.
 */
export async function handleSocialMediaRequest(
  request: Request,
  params: { photoId: string; variant: string },
  deps: SocialMediaDeps = defaultDeps()
): Promise<Response> {
  const { photoId, variant } = params;
  const { fetchAsset, signingSecret } = deps;
  if (!(signingSecret && fetchAsset)) {
    return socialJsonError(503, "Photos are not configured");
  }
  if (!(UUID_RE.test(photoId) && isSocialMediaVariant(variant))) {
    return socialJsonError(404, "Not found");
  }
  const query = new URL(request.url).searchParams;
  const valid = verifySocialMediaSignature({
    exp: query.get("exp"),
    nowMs: deps.now(),
    photoId,
    secret: signingSecret,
    sig: query.get("sig"),
    variant,
  });
  if (!valid) {
    return socialJsonError(403, "Invalid or expired link");
  }
  try {
    const assetId = await deps.getSocialPhotoAssetId(photoId);
    if (!assetId) {
      return socialJsonError(404, "Not found");
    }
    const upstream = await fetchAsset(assetId, variant);
    const headers: Record<string, string> = {
      "Cache-Control": MEDIA_CACHE_CONTROL,
      "Content-Type":
        upstream.headers.get("content-type") ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    };
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) {
      headers["Content-Length"] = contentLength;
    }
    return new Response(upstream.body, { headers, status: 200 });
  } catch (error) {
    return socialServerError(request, error, { photoId }, 502);
  }
}
