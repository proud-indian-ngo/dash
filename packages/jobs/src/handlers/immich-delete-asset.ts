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
    log.set({ event: "immich_not_configured", assetId: data.immichAssetId });
    log.warn("Immich not configured, skipping asset deletion");
    log.emit();
    return;
  }

  const res = await fetch(`${immichUrl}/api/assets`, {
    method: "DELETE",
    headers: {
      "x-api-key": immichKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ids: [data.immichAssetId], force: true }),
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
