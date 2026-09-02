import { beforeEach, describe, expect, it, mock } from "bun:test";

const hoisted = <T>(factory: () => T): T => factory();

const mocks = hoisted(() => {
  const execute = mock();
  return {
    execute,
    transaction: mock(async (operation) => operation({ execute })),
  };
});

mock.module("@pi-dash/db", () => ({
  db: {
    execute: mocks.execute,
    transaction: mocks.transaction,
  },
}));

const { withProtectedR2ObjectDeleteLock, withProtectedR2ObjectReferenceLock } =
  await import("./protected-r2-reference");

beforeEach(() => {
  mock.clearAllMocks();
  mocks.execute.mockResolvedValue([]);
});

describe("withProtectedR2ObjectDeleteLock", () => {
  it("completes the operation under an exclusive transaction lock", async () => {
    const operation = mock(async () => "deleted");

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
    const operation = mock(async () => "deleted");
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
