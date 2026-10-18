import { beforeEach, describe, expect, it, mock } from "bun:test";

import type { AsyncTask, Context } from "../../context";

const enqueue = mock();

mock.module("@pi-dash/jobs/enqueue", () => ({ enqueue }));

const { eventPhotoMutators } = await import("../event-photo");

const context = (): Context => ({
  asyncTasks: [],
  permissions: ["events.manage_photos"],
  role: "admin",
  userId: "admin-1",
});

const taskByMutator = (tasks: AsyncTask[], mutator: string) =>
  tasks.find((task) => task.meta.mutator === mutator);

beforeEach(() => {
  mock.clearAllMocks();
  enqueue.mockResolvedValue(undefined);
});

describe("event photo deletion", () => {
  it("deletes with the serialized server asset ID", async () => {
    const deletePhoto = mock();
    const forUpdate = mock(async () => [
      { immichAssetId: "asset-persisted", r2Key: null },
    ]);
    const ctx = context();
    const tx = {
      dbTransaction: {
        wrappedTransaction: {
          select: () => ({
            from: () => ({
              where: () => ({ for: forUpdate }),
            }),
          }),
        },
      },
      location: "server",
      mutate: { eventPhoto: { delete: deletePhoto } },
      run: mock()
        .mockResolvedValueOnce({
          eventId: "event-1",
          immichAssetId: null,
          r2Key: "app/photos/event-1/photo.jpg",
          status: "approved",
          uploadedBy: "volunteer-1",
        })
        .mockResolvedValueOnce({ teamId: "team-1" })
        .mockResolvedValueOnce(undefined),
    };

    await eventPhotoMutators.delete.fn({
      args: { id: "photo-1" },
      ctx,
      tx,
    } as never);

    expect(forUpdate).toHaveBeenCalledTimes(1);
    expect(forUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      deletePhoto.mock.invocationCallOrder[0] ?? 0
    );
    expect(deletePhoto).toHaveBeenCalledWith({ id: "photo-1" });

    await taskByMutator(ctx.asyncTasks ?? [], "deleteEventPhoto")?.fn();
    expect(enqueue).toHaveBeenCalledWith(
      "immich-delete-asset",
      { immichAssetId: "asset-persisted" },
      { traceId: undefined }
    );
  });

  it("keeps client deletion optimistic without a server transaction", async () => {
    const deletePhoto = mock();
    const ctx = context();
    const tx = {
      location: "client",
      mutate: { eventPhoto: { delete: deletePhoto } },
      run: mock()
        .mockResolvedValueOnce({
          eventId: "event-1",
          status: "pending",
          uploadedBy: "admin-1",
        })
        .mockResolvedValueOnce({ teamId: "team-1" }),
    };

    await eventPhotoMutators.delete.fn({
      args: { id: "photo-1" },
      ctx,
      tx,
    } as never);

    expect(deletePhoto).toHaveBeenCalledWith({ id: "photo-1" });
    expect(ctx.asyncTasks).toEqual([]);
  });
});
