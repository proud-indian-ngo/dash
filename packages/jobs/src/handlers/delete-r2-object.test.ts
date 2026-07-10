import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/protected-r2-reference", () => ({
  isProtectedR2ObjectReferenced: vi.fn(),
}));
vi.mock("./create-handler", () => ({ createNotifyHandler: vi.fn() }));
vi.mock("./r2", () => ({ getR2Client: vi.fn() }));

import { deleteR2Object } from "./delete-r2-object";

describe("deleteR2Object", () => {
  it("keeps a durable object while it is still referenced", async () => {
    const deleteObject = vi.fn();

    await deleteR2Object(
      { deleteIfUnreferenced: true, r2Key: "app/attachments/request/file.pdf" },
      {
        deleteObject,
        isReferenced: vi.fn().mockResolvedValue(true),
      }
    );

    expect(deleteObject).not.toHaveBeenCalled();
  });

  it("deletes a durable object after references disappear", async () => {
    const deleteObject = vi.fn();

    await deleteR2Object(
      { deleteIfUnreferenced: true, r2Key: "app/attachments/request/file.pdf" },
      {
        deleteObject,
        isReferenced: vi.fn().mockResolvedValue(false),
      }
    );

    expect(deleteObject).toHaveBeenCalledWith(
      "app/attachments/request/file.pdf"
    );
  });

  it("deletes a temporary source without a reference query", async () => {
    const deleteObject = vi.fn();
    const isReferenced = vi.fn();

    await deleteR2Object(
      {
        deleteIfUnreferenced: false,
        r2Key: "app/attachments/tmp/user-1/file.pdf",
      },
      { deleteObject, isReferenced }
    );

    expect(isReferenced).not.toHaveBeenCalled();
    expect(deleteObject).toHaveBeenCalled();
  });
});
