import {
  findSocialOccurrenceRowId,
  getSocialEventPhotos,
  type SocialPhotoRow,
  updateSocialPhotoMetadata,
} from "@pi-dash/db/queries/social-api";
import { env } from "@pi-dash/env/server";
import {
  parseVirtualSocialEventId,
  SOCIAL_PHOTOS_MAX,
  type SocialPhoto,
} from "@pi-dash/shared/social-api";
import { createRequestLogger } from "evlog";

import {
  fetchImmichAssetMetadata,
  getImmichConfig,
  type ImmichAssetMetadata,
} from "@/lib/immich";
import { socialJsonError } from "@/lib/social-api-auth";
import { signSocialMediaUrl } from "@/lib/social-media-url";

import {
  defaultSocialAuthorize,
  type SocialAuthorize,
  socialJson,
  socialServerError,
} from "./shared";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Immich metadata lookups in flight at once for one request. */
export const SOCIAL_PHOTO_BACKFILL_CONCURRENCY = 4;

export interface SocialPhotosDeps {
  authorize: SocialAuthorize;
  baseUrl: string;
  /** Immich asset size and capture time; null when Immich is not configured. */
  fetchAssetMetadata:
    | ((assetId: string) => Promise<ImmichAssetMetadata>)
    | null;
  findSocialOccurrenceRowId: typeof findSocialOccurrenceRowId;
  getSocialEventPhotos: typeof getSocialEventPhotos;
  now: () => number;
  signingSecret: string | undefined;
  updateSocialPhotoMetadata: typeof updateSocialPhotoMetadata;
}

function defaultDeps(): SocialPhotosDeps {
  const immich = getImmichConfig();
  return {
    authorize: defaultSocialAuthorize,
    baseUrl: env.BETTER_AUTH_URL,
    fetchAssetMetadata: immich
      ? (assetId) => fetchImmichAssetMetadata(immich, assetId)
      : null,
    findSocialOccurrenceRowId,
    getSocialEventPhotos,
    now: Date.now,
    signingSecret: env.SOCIAL_MEDIA_SIGNING_SECRET,
    updateSocialPhotoMetadata,
  };
}

/** Map `items` with at most `limit` calls of `fn` in flight, keeping order. */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index] as T);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  );
  return results;
}

/**
 * Fill missing size and capture time from Immich once and persist them. A
 * size Immich does not know is stored as 0 ("unknown, checked"), so a
 * persisted width and height mean the asset has been looked up. Best effort:
 * a failed lookup leaves the photo as it is.
 */
async function backfill(
  photo: SocialPhotoRow,
  deps: SocialPhotosDeps,
  fetchAssetMetadata: (assetId: string) => Promise<ImmichAssetMetadata>
): Promise<SocialPhotoRow> {
  if (photo.width !== null && photo.height !== null) {
    return photo;
  }
  try {
    const metadata = await fetchAssetMetadata(photo.immichAssetId);
    const checked = {
      height: metadata.height ?? 0,
      takenAt: metadata.takenAt,
      width: metadata.width ?? 0,
    };
    await deps.updateSocialPhotoMetadata(photo.id, checked);
    return {
      ...photo,
      height: photo.height ?? checked.height,
      takenAt: photo.takenAt ?? checked.takenAt,
      width: photo.width ?? checked.width,
    };
  } catch (error) {
    const log = createRequestLogger({ path: "social-api/photos" });
    log.set({ event: "photo_backfill_failed", photoId: photo.id });
    log.error(error instanceof Error ? error : String(error));
    log.emit();
    return photo;
  }
}

const takenAtOf = (photo: SocialPhotoRow) =>
  (photo.takenAt ?? photo.createdAt).getTime();

/** Usable photos first, then by capture (else upload) time. */
const rankPhotos = (a: SocialPhotoRow, b: SocialPhotoRow) =>
  Number(a.doNotUse) - Number(b.doNotUse) ||
  takenAtOf(a) - takenAtOf(b) ||
  a.id.localeCompare(b.id);

type ResolvedEventId =
  | { kind: "invalid" }
  | { kind: "row"; rowId: string }
  | { kind: "virtual" };

/**
 * A social event id is a row id, or `${seriesId}:${occDate}` for a virtual
 * occurrence; the latter resolves to its exception row when one exists.
 */
async function resolveEventId(
  eventId: string,
  deps: SocialPhotosDeps
): Promise<ResolvedEventId> {
  if (UUID_RE.test(eventId)) {
    return { kind: "row", rowId: eventId };
  }
  const virtual = parseVirtualSocialEventId(eventId);
  if (!(virtual && UUID_RE.test(virtual.seriesId))) {
    return { kind: "invalid" };
  }
  const rowId = await deps.findSocialOccurrenceRowId(
    virtual.seriesId,
    virtual.occDate
  );
  return rowId ? { kind: "row", rowId } : { kind: "virtual" };
}

/**
 * `GET /api/social/v1/events/{id}/photos` (scope photos:read): up to 12
 * approved image photos with signed, token-free links. Usable photos rank
 * first, then by capture time; "do not use" photos are returned flagged and
 * only fill places usable ones leave. A virtual occurrence id
 * (`${seriesId}:${occDate}`) with no exception row has no photos.
 */
export async function handleSocialPhotosRequest(
  request: Request,
  eventId: string,
  deps: SocialPhotosDeps = defaultDeps()
): Promise<Response> {
  const auth = await deps.authorize(request, "photos:read", "photos");
  if (auth.error) {
    return auth.error;
  }
  if (!(UUID_RE.test(eventId) || parseVirtualSocialEventId(eventId))) {
    return socialJsonError(400, "Invalid event id");
  }
  const { fetchAssetMetadata, signingSecret } = deps;
  if (!signingSecret) {
    return socialJsonError(503, "Photos are not configured");
  }
  try {
    const resolved = await resolveEventId(eventId, deps);
    if (resolved.kind === "invalid") {
      return socialJsonError(400, "Invalid event id");
    }
    if (resolved.kind === "virtual") {
      return socialJson({ photos: [] });
    }
    const rows = await deps.getSocialEventPhotos(resolved.rowId);
    if (!rows) {
      return socialJsonError(404, "Event not found");
    }
    // Without Immich the listing still works; the metadata backfill is
    // skipped and the media proxy answers 503 when a URL is fetched.
    const filled = fetchAssetMetadata
      ? await mapWithConcurrency(
          rows,
          SOCIAL_PHOTO_BACKFILL_CONCURRENCY,
          (row) => backfill(row, deps, fetchAssetMetadata)
        )
      : rows;
    const nowMs = deps.now();
    const sign = (photoId: string, variant: "original" | "thumbnail") =>
      signSocialMediaUrl({
        baseUrl: deps.baseUrl,
        nowMs,
        photoId,
        secret: signingSecret,
        variant,
      });
    const photos: SocialPhoto[] = filled
      .sort(rankPhotos)
      .slice(0, SOCIAL_PHOTOS_MAX)
      .map((photo) => ({
        caption: photo.caption,
        doNotUse: photo.doNotUse,
        // Unknown until Immich has read the EXIF; 0 means "unknown".
        height: photo.height ?? 0,
        id: photo.id,
        takenAt: new Date(takenAtOf(photo)).toISOString(),
        thumbnailUrl: sign(photo.id, "thumbnail"),
        url: sign(photo.id, "original"),
        width: photo.width ?? 0,
      }));
    return socialJson({ photos });
  } catch (error) {
    return socialServerError(request, error, { eventId });
  }
}
