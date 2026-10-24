import { describe, expect, it, mock } from "bun:test";

mock.module("@pi-dash/jobs/lib/protected-r2-reference", () => ({
  withProtectedR2ObjectDeleteLock: mock(),
}));
mock.module("./r2-upload-claim", () => ({ copyR2Object: mock() }));
mock.module("./s3", () => ({ getS3: mock() }));

import { publishImageUpload } from "./image-upload";

const input = {
  key: "app/avatars/tmp/user-1/source.png",
  keyPrefix: "app",
  userId: "user-1",
  surface: "avatars" as const,
  scopeId: "user-1",
};
const dependencies = () => ({
  copy: mock(async () => undefined),
  deleteObject: mock(async () => undefined),
  createId: mock(() => crypto.randomUUID()),
  withLock: async <T>(_key: string, fn: () => Promise<T>) => await fn(),
});

describe("publishImageUpload", () => {
  it.each([
    "app/avatars/tmp/user-2/source.png",
    "app/updates/tmp/user-1/source.png",
    "app/avatars/user-1/validated/key",
    "app/avatars/tmp/user-1/nested/key",
  ])("refuses unowned or non-temporary source %s", async (key) => {
    const deps = dependencies();
    await expect(publishImageUpload({ ...input, key }, deps)).rejects.toThrow(
      "Forbidden"
    );
    expect(deps.copy).not.toHaveBeenCalled();
    expect(deps.deleteObject).not.toHaveBeenCalled();
  });

  it("never derives a writable durable key from the caller's source", async () => {
    const deps = dependencies();
    const first = await publishImageUpload(input, deps);
    const second = await publishImageUpload(input, deps);
    expect(first.key).toStartWith("app/avatars/user-1/validated/");
    expect(second.key).not.toBe(first.key);
    expect(deps.copy).toHaveBeenCalledWith({
      sourceKey: input.key,
      targetKey: first.key,
    });
    expect(deps.deleteObject).toHaveBeenCalledWith(input.key);
  });

  it("cleans failed copies and temporary bytes without returning a public reference", async () => {
    const deps = dependencies();
    deps.copy.mockRejectedValue(new Error("Invalid image"));
    await expect(publishImageUpload(input, deps)).rejects.toThrow(
      "Invalid image"
    );
    expect(deps.deleteObject).toHaveBeenCalledWith(input.key);
    expect(deps.deleteObject).toHaveBeenCalledWith(
      expect.stringContaining("/validated/")
    );
  });
});
