import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const execute = vi.fn();
  return {
    execute,
    transaction: vi.fn(async (operation) => operation({ execute })),
  };
});

vi.mock("@pi-dash/db", () => ({
  db: {
    execute: mocks.execute,
    transaction: mocks.transaction,
  },
}));

import {
  withProtectedR2ObjectDeleteLock,
  withProtectedR2ObjectReferenceLock,
} from "./protected-r2-reference";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.execute.mockResolvedValue([]);
});

describe("withProtectedR2ObjectDeleteLock", () => {
  it("completes the operation under an exclusive transaction lock", async () => {
    const operation = vi.fn(async () => "deleted");

    await expect(
      withProtectedR2ObjectDeleteLock(
        "app/attachments/tmp/user-1/file.pdf",
        operation
      )
    ).resolves.toBe("deleted");

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(mocks.execute.mock.invocationCallOrder[0]).toBeLessThan(
      operation.mock.invocationCallOrder[0] ?? 0
    );
  });
});

describe("withProtectedR2ObjectReferenceLock", () => {
  it("checks references and completes the operation inside one transaction", async () => {
    const operation = vi.fn(async () => "deleted");
    mocks.execute
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ referenced: false }]);

    await expect(
      withProtectedR2ObjectReferenceLock(
        "app/attachments/request/file.pdf",
        operation
      )
    ).resolves.toBe("deleted");

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.execute).toHaveBeenCalledTimes(2);
    expect(operation).toHaveBeenCalledWith(false);
    expect(mocks.execute.mock.invocationCallOrder[1]).toBeLessThan(
      operation.mock.invocationCallOrder[0] ?? 0
    );
  });
});
