import { beforeEach, describe, expect, it, mock } from "bun:test";

const hoisted = <T>(factory: () => T): T => factory();

const mocks = hoisted(() => ({
  enqueue: mock(),
  eventPhotoFindFirst: mock(),
  fetch: mock(),
  file: mock(),
  insert: mock(),
  setValues: [] as unknown[],
  teamEventFindFirst: mock(),
  update: mock(),
}));

mock.module("@pi-dash/db", () => ({
  db: {
    insert: mocks.insert,
    query: {
      eventImmichAlbum: { findFirst: mock() },
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
  mocks.eventPhotoFindFirst.mockResolvedValue(null);
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
      return { where: async () => undefined };
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
});
