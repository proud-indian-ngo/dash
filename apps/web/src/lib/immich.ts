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
  return { key, url };
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
    body: JSON.stringify({ albumName: eventName }),
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.key,
    },
    method: "POST",
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
      createdAt: new Date(),
      eventId,
      id: uuidv7(),
      immichAlbumId: albumId,
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
  filename: string
): Promise<string> {
  const formData = new FormData();
  formData.append("assetData", file, filename);
  const nowIso = new Date().toISOString();
  formData.append("fileCreatedAt", nowIso);
  formData.append("fileModifiedAt", nowIso);

  const res = await fetch(`${config.url}/api/assets`, {
    body: formData,
    headers: { "x-api-key": config.key },
    method: "POST",
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
    body: JSON.stringify({ ids: [assetId] }),
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.key,
    },
    method: "PUT",
  });
  if (!res.ok) {
    throw new Error(
      `Immich addToAlbum failed: ${res.status} ${await res.text()}`
    );
  }
}

/**
 * Fetches the original (full-size) asset from Immich.
 * Accepts an optional Range header to support video streaming (HTTP 206).
 */
export async function fetchImmichOriginal(
  config: ImmichConfig,
  assetId: string,
  rangeHeader?: string | null
): Promise<Response> {
  const log = createRequestLogger({
    method: "GET",
    path: `/api/immich/original/${assetId}`,
  });
  log.set({ assetId, hasRange: !!rangeHeader });

  const headers: Record<string, string> = { "x-api-key": config.key };
  if (rangeHeader) {
    headers.Range = rangeHeader;
  }

  const timeout = rangeHeader ? 120_000 : 30_000;
  const res = await fetch(`${config.url}/api/assets/${assetId}/original`, {
    headers,
    signal: AbortSignal.timeout(timeout),
  });
  if (res.ok || res.status === 206) {
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
      originalStatus: original.status,
      thumbnailStatus: res.status,
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
