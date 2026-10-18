import { beforeEach, describe, expect, it, mock } from "bun:test";

const hoisted = <T>(factory: () => T): T => factory();

const mocks = hoisted(() => ({
  enqueue: mock(),
  eventImmichAlbumFindFirst: mock(),
  eventPhotoFindFirst: mock(),
  fetch: mock(),
  file: mock(),
  insert: mock(),
  setValues: [] as unknown[],
  teamEventFindFirst: mock(),
  update: mock(),
  updateReturningRows: [{ id: "photo-1" }] as { id: string }[],
}));

mock.module("@pi-dash/db", () => ({
  db: {
    insert: mocks.insert,
    query: {
      eventImmichAlbum: { findFirst: mocks.eventImmichAlbumFindFirst },
      eventPhoto: { findFirst: mocks.eventPhotoFindFirst },
      teamEvent: { findFirst: mocks.teamEventFindFirst },
    },
    update: mocks.update,
  },
}));
mock.module("@pi-dash/env/server", () => ({
  env: {
    IMMICH_API_KEY: "immich-key",
    IMMICH_INTERNAL_URL: "https://immich.example.test",
  },
}));
mock.module("../enqueue", () => ({ enqueue: mocks.enqueue }));
mock.module("./create-handler", () => ({ createNotifyHandler: mock() }));
mock.module("./r2", () => ({
  getR2Client: () => ({ file: mocks.file }),
}));
mock.module("uuidv7", () => ({ uuidv7: () => "album-mapping-id" }));

globalThis.fetch = mocks.fetch as unknown as typeof fetch;

const { processImmichSync } = await import("./immich-sync-photo");

beforeEach(() => {
  mock.clearAllMocks();
  mocks.setValues.length = 0;
  mocks.updateReturningRows = [{ id: "photo-1" }];
  mocks.eventImmichAlbumFindFirst.mockResolvedValue(null);
  mocks.eventPhotoFindFirst.mockResolvedValue({
    immichAssetId: null,
    r2Key: "app/photos/event-1/photo.jpg",
  });
  mocks.teamEventFindFirst.mockResolvedValue(null);
  mocks.file.mockReturnValue({ arrayBuffer: async () => new ArrayBuffer(1) });
  mocks.insert.mockReturnValue({
    values: () => ({
      onConflictDoNothing: () => ({
        returning: async () => [{ immichAlbumId: "album-1" }],
      }),
    }),
  });
  mocks.update.mockReturnValue({
    set: (values: unknown) => {
      mocks.setValues.push(values);
      return {
        where: () => ({
          returning: async () => mocks.updateReturningRows,
        }),
      };
    },
  });
  mocks.fetch
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "album-1" }), { status: 200 })
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "asset-1" }), { status: 200 })
    )
    .mockResolvedValueOnce(new Response(null, { status: 200 }));
  mocks.enqueue.mockResolvedValue(undefined);
});

describe("processImmichSync", () => {
  it("queues reference-safe R2 cleanup after clearing the photo key", async () => {
    const r2Key = "app/photos/event-1/photo.jpg";

    await processImmichSync({
      eventId: "event-1",
      eventName: "Event",
      photoId: "photo-1",
      r2Key,
    });

    expect(mocks.update).toHaveBeenCalledTimes(2);
    expect(mocks.setValues.at(-1)).toEqual({ r2Key: null });
    expect(mocks.enqueue).toHaveBeenCalledWith(
      "delete-r2-object",
      { mode: "if-unreferenced", r2Key },
      { startAfter: "30 seconds" }
    );
    expect(mocks.update.mock.invocationCallOrder.at(-1)).toBeLessThan(
      mocks.enqueue.mock.invocationCallOrder[0] ?? 0
    );
  });

  it("resumes album association after upload without uploading twice", async () => {
    const r2Key = "app/photos/event-1/photo.jpg";
    mocks.eventImmichAlbumFindFirst.mockResolvedValue({
      immichAlbumId: "album-1",
    });
    mocks.eventPhotoFindFirst
      .mockResolvedValueOnce({ immichAssetId: null, r2Key })
      .mockResolvedValueOnce({ immichAssetId: "asset-1", r2Key });
    mocks.fetch
      .mockReset()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "asset-1" }), { status: 200 })
      )
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    await expect(
      processImmichSync({
        eventId: "event-1",
        eventName: "Event",
        photoId: "photo-1",
        r2Key,
      })
    ).rejects.toThrow("Immich addToAlbum failed: 503 unavailable");

    await processImmichSync({
      eventId: "event-1",
      eventName: "Event",
      photoId: "photo-1",
      r2Key,
    });

    expect(mocks.file).toHaveBeenCalledTimes(1);
    expect(mocks.fetch).toHaveBeenCalledTimes(3);
    expect(
      mocks.fetch.mock.calls.filter(([url]) =>
        String(url).endsWith("/api/assets")
      )
    ).toHaveLength(1);
    expect(mocks.setValues).toEqual([
      { immichAssetId: "asset-1" },
      { r2Key: null },
    ]);
    expect(mocks.enqueue).toHaveBeenCalledTimes(1);
  });

  it("queues uploaded asset cleanup when the photo is deleted during upload", async () => {
    mocks.updateReturningRows = [];

    await processImmichSync({
      eventId: "event-1",
      eventName: "Event",
      photoId: "photo-1",
      r2Key: "app/photos/event-1/photo.jpg",
    });

    expect(mocks.enqueue).toHaveBeenCalledTimes(1);
    expect(mocks.enqueue).toHaveBeenCalledWith("immich-delete-asset", {
      immichAssetId: "asset-1",
    });
    expect(
      mocks.fetch.mock.calls.some(([url]) =>
        String(url).includes("/api/albums/album-1/assets")
      )
    ).toBe(false);
    expect(mocks.setValues).toEqual([{ immichAssetId: "asset-1" }]);
  });

  it("does no external work after the photo row is deleted", async () => {
    mocks.eventPhotoFindFirst.mockResolvedValue(null);

    await processImmichSync({
      eventId: "event-1",
      eventName: "Event",
      photoId: "photo-1",
      r2Key: "app/photos/event-1/photo.jpg",
    });

    expect(mocks.eventImmichAlbumFindFirst).not.toHaveBeenCalled();
    expect(mocks.file).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
});
