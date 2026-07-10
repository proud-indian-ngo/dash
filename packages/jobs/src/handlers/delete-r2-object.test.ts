import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/protected-r2-reference", () => ({
  withProtectedR2ObjectReferenceLock: vi.fn(),
}));
vi.mock("./create-handler", () => ({ createNotifyHandler: vi.fn() }));
vi.mock("./r2", () => ({ getR2Client: vi.fn() }));

import { deleteR2Object } from "./delete-r2-object";

describe("deleteR2Object", () => {
  it("keeps a durable object while it is still referenced", async () => {
    const deleteObject = vi.fn();
    const withReferenceLock = vi.fn(async (_r2Key, operation) =>
      operation(true)
    );

    await deleteR2Object(
      { deleteIfUnreferenced: true, r2Key: "app/attachments/request/file.pdf" },
      {
        deleteObject,
        withReferenceLock,
      }
    );

    expect(withReferenceLock).toHaveBeenCalled();
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it("holds the reference lock while deleting a durable object", async () => {
    const deleteObject = vi.fn();
    const order: string[] = [];
    const withReferenceLock = vi.fn(async (_r2Key, operation) => {
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
      { deleteIfUnreferenced: true, r2Key: "app/attachments/request/file.pdf" },
      {
        deleteObject,
        withReferenceLock,
      }
    );

    expect(order).toEqual(["lock", "delete", "unlock"]);
    expect(deleteObject).toHaveBeenCalledWith(
      "app/attachments/request/file.pdf"
    );
  });

  it("deletes a temporary source without a reference query", async () => {
    const deleteObject = vi.fn();
    const withReferenceLock = vi.fn();

    await deleteR2Object(
      {
        deleteIfUnreferenced: false,
        r2Key: "app/attachments/tmp/user-1/file.pdf",
      },
      { deleteObject, withReferenceLock }
    );

    expect(withReferenceLock).not.toHaveBeenCalled();
    expect(deleteObject).toHaveBeenCalled();
  });
});
