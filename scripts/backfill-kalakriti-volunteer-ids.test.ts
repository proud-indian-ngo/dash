import { describe, expect, it } from "bun:test";

import {
  kalakritiEdition,
  kalakritiEditionMembership,
} from "@pi-dash/db/schema/kalakriti";

import { backfillKalakritiVolunteerIds } from "./backfill-kalakriti-volunteer-ids";

function fixture() {
  const writes: { table: unknown; values: Record<string, unknown> }[] = [];
  const operations: string[] = [];
  let missing = [{ id: "first" }, { id: "archived" }];
  const tx = {
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          for: async (mode: string) => {
            operations.push(`lock:${mode}`);
            return [{ year: 2027, nextVolunteerSequence: 12 }];
          },
          orderBy: async () => {
            expect(table).toBe(kalakritiEditionMembership);
            operations.push("read-memberships");
            return missing;
          },
        }),
      }),
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          writes.push({ table, values });
          if (table === kalakritiEdition) {
            missing = [];
          }
        },
      }),
    }),
  };
  const database = {
    select: () => ({
      from: () => ({ orderBy: async () => [{ id: "edition" }] }),
    }),
    transaction: async (callback: (value: typeof tx) => Promise<unknown>) =>
      await callback(tx),
  };
  return { database: database as never, writes, operations };
}

describe("volunteer yearly ID backfill", () => {
  it("counts missing IDs without writes in dry-run", async () => {
    const { database, writes, operations } = fixture();
    expect(
      await backfillKalakritiVolunteerIds(database, { apply: false, now: 1000 })
    ).toEqual({ candidates: 2, updated: 0 });
    expect(writes).toEqual([]);
    expect(operations).toEqual(["lock:update", "read-memberships"]);
  });

  it("allocates in selected order, advances the sequence once, and is idempotent", async () => {
    const { database, writes, operations } = fixture();
    expect(
      await backfillKalakritiVolunteerIds(database, { apply: true, now: 1000 })
    ).toEqual({ candidates: 2, updated: 2 });
    expect(operations).toEqual(["lock:update", "read-memberships"]);
    expect(writes).toEqual([
      {
        table: kalakritiEditionMembership,
        values: { humanId: "KALV-2027-0012", updatedAt: new Date(1000) },
      },
      {
        table: kalakritiEditionMembership,
        values: { humanId: "KALV-2027-0013", updatedAt: new Date(1000) },
      },
      { table: kalakritiEdition, values: { nextVolunteerSequence: 14 } },
    ]);
    expect(
      await backfillKalakritiVolunteerIds(database, { apply: true, now: 2000 })
    ).toEqual({ candidates: 0, updated: 0 });
    expect(writes).toHaveLength(3);
  });
});
