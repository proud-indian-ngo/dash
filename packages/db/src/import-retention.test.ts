import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  addDays,
  expireImportRows,
  IMPORT_RETENTION_POLICY_VERSION,
  IMPORT_RUN_LOCK,
  type ImportRetentionStatements,
  type ImportRetentionStore,
  importedAndIdle,
  importedRowRetention,
  importRowDue,
  neverImported,
  STALE_IMPORTING_MS,
  staleImporting,
  uploadedRowRetention,
} from "./import-retention";

function fakeStore(counts: {
  deleted: number;
  expired: number;
  failed?: number;
  nulled: number;
}) {
  const calls: string[] = [];
  const statements: ImportRetentionStatements = {
    deleteUnimportedRows: async (today) => {
      calls.push(`delete:${today}`);
      return counts.deleted;
    },
    failStaleImports: async (staleBefore) => {
      calls.push(`fail:${staleBefore.toISOString()}`);
      return counts.failed ?? 0;
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
  const store: ImportRetentionStore = {
    locked: async (work) => {
      calls.push("lock");
      const result = await work(statements);
      calls.push("unlock");
      return result;
    },
  };
  return { calls, store };
}

/** A one-holder lock standing in for the advisory lock. */
function fakeLock() {
  let tail = Promise.resolve();
  return async <T>(work: () => Promise<T>): Promise<T> => {
    const previous = tail;
    let release = () => undefined as void;
    tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await work();
    } finally {
      release();
    }
  };
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

  it("fails dead runs, nulls imported rows, deletes never-imported rows, then marks emptied batches expired", async () => {
    const { calls, store } = fakeStore({
      deleted: 4,
      expired: 1,
      failed: 1,
      nulled: 7,
    });
    const now = new Date("2026-10-13T06:00:00Z");
    const result = await expireImportRows("2026-10-13", store, now);
    expect(result).toEqual({
      deletedRows: 4,
      expiredBatches: 1,
      failedStaleBatches: 1,
      nulledRows: 7,
    });
    expect(calls).toEqual([
      "lock",
      `fail:${new Date(now.getTime() - STALE_IMPORTING_MS).toISOString()}`,
      "null:2026-10-13",
      "delete:2026-10-13",
      "expire",
      "unlock",
    ]);
  });

  it("takes the same advisory lock as an import run", () => {
    const query = new PgDialect().sqlToQuery(IMPORT_RUN_LOCK);
    expect(query.sql).toBe(
      "select pg_advisory_xact_lock(hashtext('income-import-run'))"
    );
  });

  it("never deletes rows of a batch whose run is committing at that moment", async () => {
    // A failed batch, past its 30 days, being retried: the run holds the
    // lock and commits while the expiry is waiting for it.
    const batch = { importedCount: 0, status: "failed" };
    const rows = new Set(["r1", "r2"]);
    const lock = fakeLock();
    const store: ImportRetentionStore = {
      locked: async (work) =>
        await lock(
          async () =>
            await work({
              failStaleImports: async () => 0,
              deleteUnimportedRows: async () => {
                if (batch.status !== "failed" || batch.importedCount > 0) {
                  return 0;
                }
                const n = rows.size;
                rows.clear();
                return n;
              },
              markEmptyBatchesExpired: async () => 0,
              nullImportedRaw: async () => 0,
            })
        ),
    };
    let releaseRun = () => undefined as void;
    const runHolding = new Promise<void>((resolve) => {
      releaseRun = resolve;
    });
    const run = lock(async () => {
      await runHolding;
      batch.status = "completed";
      batch.importedCount = 2;
    });
    const expiry = expireImportRows("2026-12-31", store);
    releaseRun();
    await run;
    expect((await expiry).deletedRows).toBe(0);
    expect(rows.size).toBe(2);
  });

  it("is idempotent: a second run with nothing due changes nothing", async () => {
    const { store } = fakeStore({ deleted: 0, expired: 0, nulled: 0 });
    expect(await expireImportRows("2026-10-13", store)).toEqual({
      deletedRows: 0,
      expiredBatches: 0,
      failedStaleBatches: 0,
      nulledRows: 0,
    });
  });

  it("never nulls or deletes rows of a batch that is importing", () => {
    const dialect = new PgDialect();
    const imported = importedAndIdle();
    const unimported = neverImported();
    if (!(imported && unimported)) {
      throw new Error("Expected conditions");
    }
    const nulling = dialect.sqlToQuery(imported);
    expect(nulling.sql).toContain('"status" <>');
    expect(nulling.params).toContain("importing");
    // Deletion only ever looks at draft, reviewed and failed batches.
    const deleting = dialect.sqlToQuery(unimported);
    expect(deleting.params).not.toContain("importing");
    expect(deleting.params).toEqual(
      expect.arrayContaining(["draft", "reviewed", "failed"])
    );
  });

  it("treats a batch importing since before the cutoff as a dead run", () => {
    const cutoff = new Date("2026-10-12T06:00:00Z");
    const condition = staleImporting(cutoff);
    if (!condition) {
      throw new Error("Expected a condition");
    }
    const query = new PgDialect().sqlToQuery(condition);
    expect(query.sql).toContain('"status" =');
    expect(query.sql).toContain('"updated_at" <');
    expect(query.params[0]).toBe("importing");
    expect(STALE_IMPORTING_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("lets a dead run's batch be retried or expire instead of losing its rows", async () => {
    // Crashed mid-run 30 days ago: status stuck at importing, nothing imported.
    const batch = { importedCount: 0, status: "importing" as string };
    const rows = new Map([["r1", { raw: "cells" as string | null }]]);
    const store: ImportRetentionStore = {
      locked: async (work) =>
        await work({
          deleteUnimportedRows: async () => {
            if (batch.status !== "failed" || batch.importedCount > 0) {
              return 0;
            }
            const n = rows.size;
            rows.clear();
            return n;
          },
          failStaleImports: async () => {
            if (batch.status !== "importing") {
              return 0;
            }
            batch.status = "failed";
            return 1;
          },
          markEmptyBatchesExpired: async () => 0,
          nullImportedRaw: async () => {
            if (batch.status === "importing" || batch.importedCount === 0) {
              return 0;
            }
            for (const row of rows.values()) {
              row.raw = null;
            }
            return rows.size;
          },
        }),
    };
    const result = await expireImportRows("2026-11-30", store);
    expect(result.failedStaleBatches).toBe(1);
    expect(result.nulledRows).toBe(0);
    expect(batch.status).toBe("failed");
    expect(result.deletedRows).toBe(1);
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
