import { beforeEach, describe, expect, it, mock } from "bun:test";

const logged: Record<string, unknown>[] = [];
const days: string[] = [];

mock.module("@pi-dash/db/import-retention", () => ({
  expireImportRows: async (today: string) => {
    days.push(today);
    return { deletedRows: 3, expiredBatches: 1, nulledRows: 5 };
  },
}));
mock.module("evlog", () => ({
  createRequestLogger: () => ({
    emit: () => undefined,
    error: () => undefined,
    set: (fields: Record<string, unknown>) => logged.push(fields),
    warn: () => undefined,
  }),
}));

const { handleExpireImportRows } = await import("./expire-import-rows");

describe("handleExpireImportRows", () => {
  beforeEach(() => {
    logged.length = 0;
    days.length = 0;
  });

  it("applies the policy for the given day and logs counts only", async () => {
    const result = await handleExpireImportRows([], "2026-10-13");
    expect(days).toEqual(["2026-10-13"]);
    expect(result).toEqual({
      deletedRows: 3,
      expiredBatches: 1,
      nulledRows: 5,
    });
    expect(logged).toEqual([
      {
        deletedRows: 3,
        event: "import_rows_expired",
        expiredBatches: 1,
        nulledRows: 5,
      },
    ]);
  });

  it("defaults to today's date in India", async () => {
    await handleExpireImportRows([]);
    expect(days[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
