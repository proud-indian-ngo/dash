import { db } from "@pi-dash/db";
import { eventImmichAlbum, eventPhoto } from "@pi-dash/db/schema/event-photo";
import { env } from "@pi-dash/env/server";
import { format, parseISO } from "date-fns";
import { eq } from "drizzle-orm";
import { createRequestLogger } from "evlog";
import { uuidv7 } from "uuidv7";
import { enqueue, type ImmichSyncPhotoPayload } from "../enqueue";
import { createNotifyHandler } from "./create-handler";
import { getR2Client } from "./r2";

function buildImmichAlbumName(event: {
  name: string;
  recurrenceRule: { rrule: string; exdates?: string[] } | null;
  seriesId: string | null;
  originalDate: string | null;
  startTime: Date;
}) {
  const isRecurring = !!event.recurrenceRule || !!event.seriesId;
  if (!isRecurring) {
    return event.name;
  }

  const eventDate = event.originalDate
    ? parseISO(event.originalDate)
    : new Date(event.startTime);

  return `${event.name} - ${format(eventDate, "MMMM d, yyyy")}`;
}

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
    body: JSON.stringify({ albumName: eventName }),
    headers: {
      "Content-Type": "application/json",
      "x-api-key": immichKey,
    },
    method: "POST",
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
      createdAt: new Date(),
      eventId,
      id: uuidv7(),
      immichAlbumId: createdAlbumId,
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
      headers: { "x-api-key": immichKey },
      method: "DELETE",
    }).catch((error: unknown) => {
      emitLog("orphan_album_cleanup_failed", {
        error: error instanceof Error ? error.message : String(error),
        eventId,
        orphanedAlbumId: createdAlbumId,
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

export async function processImmichSync(data: ImmichSyncPhotoPayload) {
  const { photoId, eventId, eventName, r2Key } = data;

  const immichUrl = env.IMMICH_INTERNAL_URL ?? env.VITE_IMMICH_URL;
  const immichKey = env.IMMICH_API_KEY;
  if (!(immichUrl && immichKey)) {
    emitLog("immich_not_configured", { eventId, photoId });
    return;
  }

  // Retry resilience: if photo already has an immichAssetId, skip upload
  const currentPhoto = await db.query.eventPhoto.findFirst({
    columns: { immichAssetId: true },
    where: (t, { eq: e }) => e(t.id, photoId),
  });
  if (currentPhoto?.immichAssetId) {
    emitLog("already_synced", {
      immichAssetId: currentPhoto.immichAssetId,
      photoId,
    });
    return;
  }

  const event = await db.query.teamEvent.findFirst({
    columns: {
      name: true,
      originalDate: true,
      recurrenceRule: true,
      seriesId: true,
      startTime: true,
    },
    where: (t, { eq: e }) => e(t.id, eventId),
  });

  const albumName = event ? buildImmichAlbumName(event) : eventName;

  const albumId = await resolveAlbumId(
    eventId,
    albumName,
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
  const nowIso = new Date().toISOString();
  formData.append("fileCreatedAt", nowIso);
  formData.append("fileModifiedAt", nowIso);

  const uploadRes = await fetch(`${immichUrl}/api/assets`, {
    body: formData,
    headers: { "x-api-key": immichKey },
    method: "POST",
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
    body: JSON.stringify({ ids: [assetId] }),
    headers: {
      "Content-Type": "application/json",
      "x-api-key": immichKey,
    },
    method: "PUT",
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

  // Clean up R2 object through the reference-safe deletion boundary.
  try {
    await enqueue(
      "delete-r2-object",
      { mode: "if-unreferenced", r2Key },
      { startAfter: "30 seconds" }
    );
  } catch (error) {
    emitLog("r2_cleanup_enqueue_failed", {
      error: error instanceof Error ? error.message : String(error),
      photoId,
      r2Key,
    });
  }
}

export const handleImmichSyncPhoto =
  createNotifyHandler<ImmichSyncPhotoPayload>(
    "immich-sync-photo",
    async () => processImmichSync
  );
