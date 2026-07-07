import { env } from "@pi-dash/env/server";
import { createRequestLogger } from "evlog";
import type { ImmichDeleteAssetPayload } from "../enqueue";
import { createNotifyHandler } from "./create-handler";

async function deleteImmichAsset(data: ImmichDeleteAssetPayload) {
  const immichUrl = env.IMMICH_INTERNAL_URL ?? env.VITE_IMMICH_URL;
  const immichKey = env.IMMICH_API_KEY;
  if (!(immichUrl && immichKey)) {
    const log = createRequestLogger({
      method: "JOB",
      path: "immich-delete-asset",
    });
    log.set({ assetId: data.immichAssetId, event: "immich_not_configured" });
    log.warn("Immich not configured, skipping asset deletion");
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
}

export const handleImmichDeleteAsset =
  createNotifyHandler<ImmichDeleteAssetPayload>(
    "immich-delete-asset",
    async () => deleteImmichAsset
  );
