import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  addDays,
  expireImportRows,
  IMPORT_RETENTION_POLICY_VERSION,
  type ImportRetentionStore,
  importedRowRetention,
  importRowDue,
  uploadedRowRetention,
} from "./import-retention";

function fakeStore(counts: {
  deleted: number;
  expired: number;
  nulled: number;
}) {
  const calls: string[] = [];
  const store: ImportRetentionStore = {
    deleteUnimportedRows: async (today) => {
      calls.push(`delete:${today}`);
      return counts.deleted;
    },
    markEmptyBatchesExpired: async () => {
      calls.push("expire");
      return counts.expired;
    },
    nullImportedRaw: async (today) => {
      calls.push(`null:${today}`);
      return counts.nulled;
    },
  };
  return { calls, store };
}

describe("import row retention", () => {
  it("adds calendar days across month and year ends", () => {
    expect(addDays("2026-10-13", 30)).toBe("2026-11-12");
    expect(addDays("2026-12-15", 180)).toBe("2027-06-13");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("keeps uploaded rows 30 days and imported rows 180 days", () => {
    expect(uploadedRowRetention("2026-10-13")).toEqual({
      legalHold: false,
      retainUntil: "2026-11-12",
      retentionBasis: "import_payload_not_imported",
      retentionPolicyVersion: IMPORT_RETENTION_POLICY_VERSION,
    });
    expect(importedRowRetention("2026-10-13")).toEqual({
      retainUntil: "2027-04-11",
      retentionBasis: "import_payload_imported",
      retentionPolicyVersion: IMPORT_RETENTION_POLICY_VERSION,
    });
  });

  it("nulls imported rows, deletes never-imported rows, then marks emptied batches expired", async () => {
    const { calls, store } = fakeStore({ deleted: 4, expired: 1, nulled: 7 });
    const result = await expireImportRows("2026-10-13", store);
    expect(result).toEqual({
      deletedRows: 4,
      expiredBatches: 1,
      nulledRows: 7,
    });
    expect(calls).toEqual(["null:2026-10-13", "delete:2026-10-13", "expire"]);
  });

  it("is idempotent: a second run with nothing due changes nothing", async () => {
    const { store } = fakeStore({ deleted: 0, expired: 0, nulled: 0 });
    expect(await expireImportRows("2026-10-13", store)).toEqual({
      deletedRows: 0,
      expiredBatches: 0,
      nulledRows: 0,
    });
  });

  it("only treats rows past their date and not under legal hold as due", () => {
    const condition = importRowDue("2026-10-13");
    if (!condition) {
      throw new Error("Expected a condition");
    }
    const query = new PgDialect().sqlToQuery(condition);
    expect(query.sql).toContain('"retain_until" <');
    expect(query.sql).toContain('"legal_hold" =');
    expect(query.params).toEqual(["2026-10-13", false]);
  });
});
