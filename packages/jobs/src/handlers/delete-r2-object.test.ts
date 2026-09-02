import { describe, expect, it, mock } from "bun:test";

mock.module("../lib/protected-r2-reference", () => ({
  withProtectedR2ObjectDeleteLock: mock(),
  withProtectedR2ObjectReferenceLock: mock(),
}));
mock.module("./create-handler", () => ({ createNotifyHandler: mock() }));
mock.module("./r2", () => ({ getR2Client: mock() }));

const { deleteR2Object } = await import("./delete-r2-object");

describe("deleteR2Object", () => {
  it("keeps a durable object while it is still referenced", async () => {
    const deleteObject = mock();
    const withDeleteLock = mock();
    const withReferenceLock = mock(async (_r2Key, operation) =>
      operation(true)
    );

    await deleteR2Object(
      {
        mode: "if-unreferenced",
        r2Key: "app/attachments/request/file.pdf",
      },
      {
        deleteObject,
        withDeleteLock,
        withReferenceLock,
      }
    );

    expect(withReferenceLock).toHaveBeenCalled();
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it("holds the reference lock while deleting a durable object", async () => {
    const deleteObject = mock();
    const withDeleteLock = mock();
    const order: string[] = [];
    const withReferenceLock = mock(async (_r2Key, operation) => {
      order.push("lock");
      const result = await operation(false);
      order.push("unlock");
      return result;
    });
    deleteObject.mockImplementation(() => {
      order.push("delete");
      return Promise.resolve();
    });

    await deleteR2Object(
      {
        mode: "if-unreferenced",
        r2Key: "app/attachments/request/file.pdf",
      },
      {
        deleteObject,
        withDeleteLock,
        withReferenceLock,
      }
    );

    expect(order).toEqual(["lock", "delete", "unlock"]);
    expect(deleteObject).toHaveBeenCalledWith(
      "app/attachments/request/file.pdf"
    );
  });

  it("reference-checks a persisted legacy job without a mode", async () => {
    const deleteObject = mock();
    const withDeleteLock = mock();
    const withReferenceLock = mock(async (_r2Key, operation) =>
      operation(true)
    );

    await deleteR2Object(
      { r2Key: "app/attachments/request/file.pdf" } as never,
      { deleteObject, withDeleteLock, withReferenceLock }
    );

    expect(withReferenceLock).toHaveBeenCalled();
    expect(withDeleteLock).not.toHaveBeenCalled();
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it("holds an exclusive key lock while deleting a temporary source", async () => {
    const deleteObject = mock();
    const order: string[] = [];
    const withDeleteLock = mock(async (_r2Key, operation) => {
      order.push("lock");
      const result = await operation();
      order.push("unlock");
      return result;
    });
    const withReferenceLock = mock();
    deleteObject.mockImplementation(() => {
      order.push("delete");
      return Promise.resolve();
    });

    await deleteR2Object(
      {
        mode: "temporary-source",
        r2Key: "app/attachments/tmp/user-1/file.pdf",
      },
      { deleteObject, withDeleteLock, withReferenceLock }
    );

    expect(withReferenceLock).not.toHaveBeenCalled();
    expect(withDeleteLock).toHaveBeenCalledWith(
      "app/attachments/tmp/user-1/file.pdf",
      expect.any(Function)
    );
    expect(order).toEqual(["lock", "delete", "unlock"]);
  });
});
