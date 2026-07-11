import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enqueue: vi.fn(),
  eventPhotoFindFirst: vi.fn(),
  fetch: vi.fn(),
  file: vi.fn(),
  insert: vi.fn(),
  setValues: [] as unknown[],
  teamEventFindFirst: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@pi-dash/db", () => ({
  db: {
    insert: mocks.insert,
    query: {
      eventImmichAlbum: { findFirst: vi.fn() },
      eventPhoto: { findFirst: mocks.eventPhotoFindFirst },
      teamEvent: { findFirst: mocks.teamEventFindFirst },
    },
    update: mocks.update,
  },
}));
vi.mock("@pi-dash/env/server", () => ({
  env: {
    IMMICH_API_KEY: "immich-key",
    IMMICH_INTERNAL_URL: "https://immich.example.test",
  },
}));
vi.mock("../enqueue", () => ({ enqueue: mocks.enqueue }));
vi.mock("./create-handler", () => ({ createNotifyHandler: vi.fn() }));
vi.mock("./r2", () => ({
  getR2Client: () => ({ file: mocks.file }),
}));
vi.mock("uuidv7", () => ({ uuidv7: () => "album-mapping-id" }));

vi.stubGlobal("fetch", mocks.fetch);

import { processImmichSync } from "./immich-sync-photo";

beforeEach(() => {
  vi.clearAllMocks();
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
