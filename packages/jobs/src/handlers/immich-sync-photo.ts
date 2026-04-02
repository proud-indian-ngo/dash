import { db } from "@pi-dash/db";
import { eventImmichAlbum, eventPhoto } from "@pi-dash/db/schema/event-photo";
import { env } from "@pi-dash/env/server";
import { eq } from "drizzle-orm";
import { createRequestLogger } from "evlog";
import { uuidv7 } from "uuidv7";
import type { ImmichSyncPhotoPayload } from "../enqueue";
import { createNotifyHandler } from "./create-handler";
import { getR2Client } from "./r2";

async function resolveAlbumId(
  eventId: string,
  eventName: string,
  immichUrl: string,
  immichKey: string
): Promise<string> {
  const existingAlbum = await db.query.eventImmichAlbum.findFirst({
    where: (t, { eq: e }) => e(t.eventId, eventId),
  });
  if (existingAlbum) {
    return existingAlbum.immichAlbumId;
  }

  const albumRes = await fetch(`${immichUrl}/api/albums`, {
    method: "POST",
    headers: {
      "x-api-key": immichKey,
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
  const createdAlbumId = albumData.id;

  const inserted = await db
    .insert(eventImmichAlbum)
    .values({
      id: uuidv7(),
      eventId,
      immichAlbumId: createdAlbumId,
      createdAt: new Date(),
    })
    .onConflictDoNothing({ target: eventImmichAlbum.eventId })
    .returning({ immichAlbumId: eventImmichAlbum.immichAlbumId });

  if (inserted.length > 0) {
    return createdAlbumId;
  }

  // Another job won the race — use their album and clean up ours (best-effort)
  const winner = await db.query.eventImmichAlbum.findFirst({
    where: (t, { eq: e }) => e(t.eventId, eventId),
  });
  const winnerAlbumId = winner?.immichAlbumId ?? createdAlbumId;

  if (winnerAlbumId !== createdAlbumId) {
    fetch(`${immichUrl}/api/albums/${createdAlbumId}`, {
      method: "DELETE",
      headers: { "x-api-key": immichKey },
    }).catch((error: unknown) => {
      emitLog("orphan_album_cleanup_failed", {
        eventId,
        orphanedAlbumId: createdAlbumId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  return winnerAlbumId;
}

function emitLog(event: string, extra: Record<string, unknown>) {
  const log = createRequestLogger({ method: "JOB", path: "immich-sync-photo" });
  log.set({ event, ...extra });
  log.emit();
}

async function processImmichSync(data: ImmichSyncPhotoPayload) {
  const { photoId, eventId, eventName, r2Key } = data;

  const immichUrl = env.VITE_IMMICH_URL;
  const immichKey = env.IMMICH_API_KEY;
  if (!(immichUrl && immichKey)) {
    emitLog("immich_not_configured", { photoId, eventId });
    return;
  }

  // Retry resilience: if photo already has an immichAssetId, skip upload
  const currentPhoto = await db.query.eventPhoto.findFirst({
    where: (t, { eq: e }) => e(t.id, photoId),
    columns: { immichAssetId: true },
  });
  if (currentPhoto?.immichAssetId) {
    emitLog("already_synced", {
      photoId,
      immichAssetId: currentPhoto.immichAssetId,
    });
    return;
  }

  const albumId = await resolveAlbumId(
    eventId,
    eventName,
    immichUrl,
    immichKey
  );

  // Download from R2
  const s3 = getR2Client();
  const file = s3.file(r2Key);
  const buffer = await file.arrayBuffer();
  const blob = new Blob([buffer]);

  // Upload to Immich
  const filename = r2Key.split("/").pop() ?? r2Key;
  const formData = new FormData();
  formData.append("assetData", blob, filename);
  formData.append("deviceAssetId", `pi-dash-${r2Key}`);
  formData.append("deviceId", "pi-dash");
  const nowIso = new Date().toISOString();
  formData.append("fileCreatedAt", nowIso);
  formData.append("fileModifiedAt", nowIso);

  const uploadRes = await fetch(`${immichUrl}/api/assets`, {
    method: "POST",
    headers: { "x-api-key": immichKey },
    body: formData,
  });
  if (!uploadRes.ok) {
    throw new Error(
      `Immich upload failed: ${uploadRes.status} ${await uploadRes.text()}`
    );
  }
  const uploadData = (await uploadRes.json()) as { id: string };
  const assetId = uploadData.id;

  // Persist assetId immediately so retries skip the upload step
  await db
    .update(eventPhoto)
    .set({ immichAssetId: assetId })
    .where(eq(eventPhoto.id, photoId));

  // Add to album
  const addRes = await fetch(`${immichUrl}/api/albums/${albumId}/assets`, {
    method: "PUT",
    headers: {
      "x-api-key": immichKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ids: [assetId] }),
  });
  if (!addRes.ok) {
    throw new Error(
      `Immich addToAlbum failed: ${addRes.status} ${await addRes.text()}`
    );
  }

  // Clear R2 key now that Immich owns the asset
  await db
    .update(eventPhoto)
    .set({ r2Key: null })
    .where(eq(eventPhoto.id, photoId));

  // Clean up R2 object — best-effort, don't throw
  try {
    await s3.delete(r2Key);
  } catch (error) {
    emitLog("r2_cleanup_failed", {
      photoId,
      r2Key,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export const handleImmichSyncPhoto =
  createNotifyHandler<ImmichSyncPhotoPayload>(
    "immich-sync-photo",
    async () => processImmichSync
  );
