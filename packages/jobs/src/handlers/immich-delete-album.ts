import { env } from "@pi-dash/env/server";
import { createRequestLogger } from "evlog";
import type { ImmichDeleteAlbumPayload } from "../enqueue";
import { createNotifyHandler } from "./create-handler";

async function deleteImmichAlbum(data: ImmichDeleteAlbumPayload) {
  const immichUrl = env.IMMICH_INTERNAL_URL ?? env.VITE_IMMICH_URL;
  const immichKey = env.IMMICH_API_KEY;
  if (!(immichUrl && immichKey)) {
    const log = createRequestLogger({
      method: "JOB",
      path: "immich-delete-album",
    });
    log.set({ event: "immich_not_configured", albumId: data.immichAlbumId });
    log.warn("Immich not configured, skipping album deletion");
    log.emit();
    return;
  }

  const res = await fetch(`${immichUrl}/api/albums/${data.immichAlbumId}`, {
    method: "DELETE",
    headers: { "x-api-key": immichKey },
  });
  // 404 = album already gone, treat as success
  if (!res.ok && res.status !== 404) {
    throw new Error(
      `Immich deleteAlbum failed: ${res.status} ${await res.text()}`
    );
  }
}

export const handleImmichDeleteAlbum =
  createNotifyHandler<ImmichDeleteAlbumPayload>(
    "immich-delete-album",
    async () => deleteImmichAlbum
  );
