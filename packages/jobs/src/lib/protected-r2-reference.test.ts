import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const execute = vi
    .fn()
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([{ referenced: false }]);
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

import { withProtectedR2ObjectReferenceLock } from "./protected-r2-reference";

describe("withProtectedR2ObjectReferenceLock", () => {
  it("checks references and completes the operation inside one transaction", async () => {
    const operation = vi.fn(async () => "deleted");

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
