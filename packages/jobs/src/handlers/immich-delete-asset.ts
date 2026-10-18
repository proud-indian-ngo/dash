import { db } from "@pi-dash/db";
import { env } from "@pi-dash/env/server";
import { createRequestLogger } from "evlog";

import type { ImmichDeleteAssetPayload } from "../enqueue";
import { createNotifyHandler } from "./create-handler";

export async function deleteImmichAsset(data: ImmichDeleteAssetPayload) {
  const log = createRequestLogger({
    method: "JOB",
    path: "immich-delete-asset",
  });
  log.set({ assetId: data.immichAssetId });
  const immichUrl = env.IMMICH_INTERNAL_URL ?? env.VITE_IMMICH_URL;
  const immichKey = env.IMMICH_API_KEY;
  if (!(immichUrl && immichKey)) {
    log.set({ event: "immich_not_configured" });
    log.warn("Immich not configured, skipping asset deletion");
    log.emit();
    return;
  }

  // Immich deduplicates identical uploads, so multiple photo rows can refer
  // to the same asset even when they belong to different events.
  const reference = await db.query.eventPhoto.findFirst({
    columns: { id: true },
    where: (photo, { eq }) => eq(photo.immichAssetId, data.immichAssetId),
  });
  if (reference) {
    log.set({ event: "immich_asset_still_referenced" });
    log.emit();
    return;
  }

  const res = await fetch(`${immichUrl}/api/assets`, {
    body: JSON.stringify({ force: true, ids: [data.immichAssetId] }),
    headers: {
      "Content-Type": "application/json",
      "x-api-key": immichKey,
    },
    method: "DELETE",
  });
  if (!res.ok) {
    throw new Error(
      `Immich deleteAsset failed: ${res.status} ${await res.text()}`
    );
  }
  log.set({ event: "immich_asset_deleted" });
  log.emit();
}

export const handleImmichDeleteAsset =
  createNotifyHandler<ImmichDeleteAssetPayload>(
    "immich-delete-asset",
    async () => deleteImmichAsset
  );
