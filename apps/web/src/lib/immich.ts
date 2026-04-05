import { db } from "@pi-dash/db";
import { eventImmichAlbum } from "@pi-dash/db/schema/event-photo";
import { env } from "@pi-dash/env/server";
import { eq } from "drizzle-orm";
import { createRequestLogger } from "evlog";
import { uuidv7 } from "uuidv7";

interface ImmichConfig {
  key: string;
  url: string;
}

export function getImmichConfig(): ImmichConfig | null {
  const url = env.VITE_IMMICH_URL;
  const key = env.IMMICH_API_KEY;
  if (!(url && key)) {
    return null;
  }
  return { url, key };
}

/**
 * Ensures an Immich album exists for the given event.
 * Creates the album in Immich if needed, then upserts into the DB.
 * Returns the Immich album ID.
 */
export async function ensureImmichAlbum(
  config: ImmichConfig,
  eventId: string,
  eventName: string
): Promise<string> {
  const existing = await db.query.eventImmichAlbum.findFirst({
    where: eq(eventImmichAlbum.eventId, eventId),
  });
  if (existing) {
    return existing.immichAlbumId;
  }

  const albumRes = await fetch(`${config.url}/api/albums`, {
    method: "POST",
    headers: {
      "x-api-key": config.key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ albumName: eventName }),
  });
  if (!albumRes.ok) {
    throw new Error(
      `Immich createAlbum failed: ${albumRes.status} ${await albumRes.text()}`
    );
  }
  const albumData = (await albumRes.json()) as { id: string };
  let albumId = albumData.id;

  // Upsert — ON CONFLICT handles concurrent uploads for the same event
  const inserted = await db
    .insert(eventImmichAlbum)
    .values({
      id: uuidv7(),
      eventId,
      immichAlbumId: albumId,
      createdAt: new Date(),
    })
    .onConflictDoNothing({ target: eventImmichAlbum.eventId })
    .returning({ immichAlbumId: eventImmichAlbum.immichAlbumId });

  // If conflict, another task already created the row — use that album ID
  if (inserted.length === 0) {
    const conflicted = await db.query.eventImmichAlbum.findFirst({
      where: eq(eventImmichAlbum.eventId, eventId),
    });
    if (conflicted) {
      albumId = conflicted.immichAlbumId;
    }
  }

  return albumId;
}

/**
 * Uploads a file to Immich and returns the asset ID.
 */
export async function uploadAssetToImmich(
  config: ImmichConfig,
  file: Blob,
  filename: string,
  deviceAssetId: string
): Promise<string> {
  const formData = new FormData();
  formData.append("assetData", file, filename);
  formData.append("deviceAssetId", deviceAssetId);
  formData.append("deviceId", "pi-dash");
  const nowIso = new Date().toISOString();
  formData.append("fileCreatedAt", nowIso);
  formData.append("fileModifiedAt", nowIso);

  const res = await fetch(`${config.url}/api/assets`, {
    method: "POST",
    headers: { "x-api-key": config.key },
    body: formData,
  });
  if (!res.ok) {
    throw new Error(`Immich upload failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { id: string };
  return data.id;
}

/**
 * Adds an asset to an Immich album.
 */
export async function addAssetToAlbum(
  config: ImmichConfig,
  albumId: string,
  assetId: string
): Promise<void> {
  const res = await fetch(`${config.url}/api/albums/${albumId}/assets`, {
    method: "PUT",
    headers: {
      "x-api-key": config.key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ids: [assetId] }),
  });
  if (!res.ok) {
    throw new Error(
      `Immich addToAlbum failed: ${res.status} ${await res.text()}`
    );
  }
}

/**
 * Fetches the original (full-size) image for an Immich asset.
 */
export async function fetchImmichOriginal(
  config: ImmichConfig,
  assetId: string
): Promise<Response> {
  const log = createRequestLogger({
    method: "GET",
    path: `/api/immich/original/${assetId}`,
  });
  log.set({ assetId });

  const res = await fetch(`${config.url}/api/assets/${assetId}/original`, {
    headers: { "x-api-key": config.key },
    signal: AbortSignal.timeout(30_000),
  });
  if (res.ok) {
    log.emit();
    return res;
  }

  log.error(`Immich original fetch failed: ${res.status}`, {
    status: res.status,
  });
  log.emit();
  throw new Error(`Immich original failed: ${res.status}`);
}

/**
 * Fetches a thumbnail for an Immich asset. Returns the response to stream back.
 * Falls back to the original asset file if thumbnail is not yet generated (404).
 */
export async function fetchImmichThumbnail(
  config: ImmichConfig,
  assetId: string
): Promise<Response> {
  const log = createRequestLogger({
    method: "GET",
    path: `/api/immich/thumbnail/${assetId}`,
  });
  log.set({ assetId });
  const headers = { "x-api-key": config.key };

  // Try thumbnail first
  const res = await fetch(
    `${config.url}/api/assets/${assetId}/thumbnail?size=thumbnail`,
    { headers }
  );
  if (res.ok) {
    log.emit();
    return res;
  }

  // Thumbnail may not be generated yet — fall back to original asset
  if (res.status === 404) {
    log.set({ fallback: "original" });
    const original = await fetch(
      `${config.url}/api/assets/${assetId}/original`,
      { headers }
    );
    if (original.ok) {
      log.emit();
      return original;
    }
    log.error(`Immich original fetch also failed: ${original.status}`, {
      thumbnailStatus: res.status,
      originalStatus: original.status,
    });
    log.emit();
    throw new Error(`Immich asset not found: ${assetId}`);
  }

  log.error(`Immich thumbnail fetch failed: ${res.status}`, {
    status: res.status,
  });
  log.emit();
  throw new Error(`Immich thumbnail failed: ${res.status}`);
}
