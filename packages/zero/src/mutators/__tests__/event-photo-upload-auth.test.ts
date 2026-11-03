import { describe, expect, it, mock } from "bun:test";

import type { Context } from "../../context";
import { eventPhotoMutators } from "../event-photo";

const directArgs = {
  eventId: "event-1",
  id: "photo-1",
  immichAssetId: "asset-1",
  immichUploadReceipt: "receipt",
  mimeType: "image/jpeg",
  now: 1,
};

function context(
  permissions: string[],
  verifyImmichUploadReceipt = mock(() => true)
): Context {
  return {
    permissions,
    role: "volunteer",
    userId: "user-1",
    verifyImmichUploadReceipt,
  };
}

function transaction(
  insert = mock(),
  isLead = false,
  existingPhoto: unknown = undefined
) {
  const execute = mock(async () => undefined);
  return {
    execute,
    insert,
    tx: {
      dbTransaction: { wrappedTransaction: { execute } },
      location: "server",
      mutate: { eventPhoto: { insert } },
      run: mock()
        .mockResolvedValueOnce({
          name: "Event",
          startTime: 1,
          teamId: "team-1",
        })
        .mockResolvedValueOnce(isLead ? { id: "lead-1" } : undefined)
        .mockResolvedValueOnce(existingPhoto),
    },
  };
}

describe("direct Immich event-photo authorization", () => {
  it("accepts a valid receipt for a current photo manager", async () => {
    const verify = mock(() => true);
    const ctx = context(["events.manage_photos"], verify);
    const { insert, tx } = transaction();

    await eventPhotoMutators.upload.fn({
      args: directArgs,
      ctx,
      tx,
    } as never);

    expect(verify).toHaveBeenCalledWith({
      assetId: "asset-1",
      eventId: "event-1",
      mimeType: "image/jpeg",
      photoId: "photo-1",
      receipt: "receipt",
      userId: "user-1",
    });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        immichAssetId: "asset-1",
        status: "approved",
        uploadedBy: "user-1",
      })
    );
  });

  it("rejects a forged receipt without writing", async () => {
    const ctx = context(
      ["events.manage_photos"],
      mock(() => false)
    );
    const { insert, tx } = transaction();

    await expect(
      eventPhotoMutators.upload.fn({ args: directArgs, ctx, tx } as never)
    ).rejects.toThrow("Invalid or expired Immich upload receipt");
    expect(insert).not.toHaveBeenCalled();
  });

  it("fails closed when the receipt verifier is absent", async () => {
    const ctx = context(["events.manage_photos"]);
    ctx.verifyImmichUploadReceipt = undefined;
    const { insert, tx } = transaction();

    await expect(
      eventPhotoMutators.upload.fn({ args: directArgs, ctx, tx } as never)
    ).rejects.toThrow("Invalid or expired Immich upload receipt");
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects an uploader whose photo-management authority was revoked", async () => {
    const ctx = context(
      [],
      mock(() => true)
    );
    const { insert, tx } = transaction();

    await expect(
      eventPhotoMutators.upload.fn({ args: directArgs, ctx, tx } as never)
    ).rejects.toThrow();
    expect(insert).not.toHaveBeenCalled();
  });

  it("allows a current team lead with a valid receipt", async () => {
    const ctx = context(
      [],
      mock(() => true)
    );
    const { insert, tx } = transaction(undefined, true);

    await eventPhotoMutators.upload.fn({
      args: directArgs,
      ctx,
      tx,
    } as never);

    expect(insert).toHaveBeenCalledTimes(1);
  });
});

describe("event-photo upload id reuse", () => {
  it("rejects an existing photo id before writing or queuing Immich sync", async () => {
    const ctx: Context = {
      ...context([]),
      asyncTasks: [],
      beforeCommitTasks: [],
      copyR2Object: mock(async () => undefined),
      enqueue: mock(async () => null),
      lockR2Object: mock(async () => undefined),
      lockR2ObjectForClaim: mock(async () => undefined),
      r2KeyPrefix: "app",
      rollbackTasks: [],
    };
    const { execute, insert, tx } = transaction(undefined, true, {
      eventId: "other-event",
      id: "photo-1",
    });

    await expect(
      eventPhotoMutators.upload.fn({
        args: {
          eventId: "event-1",
          id: "photo-1",
          mimeType: "image/jpeg",
          now: 1,
          r2Key: "app/photos/tmp/user-1/photo.jpg",
        },
        ctx,
        tx,
      } as never)
    ).rejects.toThrow("Record already exists");
    expect(execute).toHaveBeenCalledTimes(1);
    expect(insert).not.toHaveBeenCalled();
    expect(ctx.beforeCommitTasks).toEqual([]);
    expect(ctx.asyncTasks).toEqual([]);
  });
});
