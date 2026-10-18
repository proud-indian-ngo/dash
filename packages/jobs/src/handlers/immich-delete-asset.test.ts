import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

import { eventPhoto } from "@pi-dash/db/schema/event-photo";
import { PgDialect } from "drizzle-orm/pg-core";

const findPhoto = mock();
mock.module("@pi-dash/db", () => ({
  db: { query: { eventPhoto: { findFirst: findPhoto } } },
}));
mock.module("@pi-dash/env/server", () => ({
  env: {
    IMMICH_API_KEY: "test-key",
    IMMICH_INTERNAL_URL: "https://immich.example.test",
  },
}));
mock.module("./create-handler", () => ({ createNotifyHandler: mock() }));

const { deleteImmichAsset } = await import("./immich-delete-asset");

describe("deleteImmichAsset", () => {
  beforeEach(() => {
    mock.restore();
    findPhoto.mockReset();
  });

  it("keeps an asset referenced by another event photo", async () => {
    const fetch = spyOn(globalThis, "fetch").mockResolvedValue(new Response());
    findPhoto.mockResolvedValue({ id: "other-photo" });

    await deleteImmichAsset({ immichAssetId: "shared-asset" });

    const { eq } = await import("drizzle-orm");
    const predicate = findPhoto.mock.calls[0]?.[0].where(eventPhoto, { eq });
    expect(new PgDialect().sqlToQuery(predicate).params).toEqual([
      "shared-asset",
    ]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("deletes the asset after its last photo reference is removed", async () => {
    const fetch = spyOn(globalThis, "fetch").mockResolvedValue(new Response());
    findPhoto.mockResolvedValue(undefined);

    await deleteImmichAsset({ immichAssetId: "unreferenced-asset" });

    expect(fetch).toHaveBeenCalledWith(
      "https://immich.example.test/api/assets",
      expect.objectContaining({
        body: JSON.stringify({ force: true, ids: ["unreferenced-asset"] }),
        method: "DELETE",
      })
    );
  });

  it("fails closed when checking references fails", async () => {
    const fetch = spyOn(globalThis, "fetch").mockResolvedValue(new Response());
    findPhoto.mockRejectedValue(new Error("database unavailable"));

    await expect(deleteImmichAsset({ immichAssetId: "asset" })).rejects.toThrow(
      "database unavailable"
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
