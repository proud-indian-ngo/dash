import { describe, expect, it } from "bun:test";

import { ensureKalakritiGuardianHumanId } from "@pi-dash/db/kalakriti-guardian-id";
import { parseGuardianIdBackfillOptions } from "@pi-dash/db/kalakriti-guardian-id-backfill";
import { planKalakritiGuardianIds } from "@pi-dash/db/kalakriti-guardian-id-plan";
import {
  kalakritiEdition,
  kalakritiEditionMembership,
} from "@pi-dash/db/schema/kalakriti";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

import { formatKalakritiGuardianHumanId } from "../packages/shared/src/kalakriti";
import { backfillKalakritiGuardianIds } from "./backfill-kalakriti-guardian-ids";

const editionId = "019f0000-0000-7000-8000-000000000001";
const url = "postgres://user:password@localhost:5433/isolated";
const scope = `--edition-id=${editionId}`;

describe("Guardian yearly ID planning and target guard", () => {
  it("uses the existing KALV prefix convention with a distinct Guardian namespace", () => {
    expect(formatKalakritiGuardianHumanId(2027, 1)).toBe("KALG-2027-0001");
    expect(formatKalakritiGuardianHumanId(2027, 10_000)).toBe(
      "KALG-2027-10000"
    );
  });
  it.each([0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid sequence %s",
    (sequence) => {
      expect(() => formatKalakritiGuardianHumanId(2027, sequence)).toThrow();
    }
  );
  it("reserves archived IDs above a stale counter, without using other prefixes or Editions", () => {
    expect(
      planKalakritiGuardianIds({
        year: 2027,
        nextGuardianSequence: 1,
        existingHumanIds: [
          "KALG-2027-0040",
          "KALG-2028-9999",
          "KALV-2027-9999",
          null,
        ],
        count: 2,
      })
    ).toEqual({
      humanIds: ["KALG-2027-0041", "KALG-2027-0042"],
      nextGuardianSequence: 43,
    });
  });
  it("retains a higher counter and does not recycle gaps", () => {
    expect(
      planKalakritiGuardianIds({
        year: 2027,
        nextGuardianSequence: 50,
        existingHumanIds: ["KALG-2027-0001"],
        count: 1,
      }).humanIds
    ).toEqual(["KALG-2027-0050"]);
  });
  it("fails closed on sequence exhaustion", () => {
    expect(() =>
      planKalakritiGuardianIds({
        year: 2027,
        nextGuardianSequence: 2_147_483_647,
        existingHumanIds: [],
        count: 1,
      })
    ).toThrow("exhausted");
  });
  it("defaults to dry-run and requires an explicit Edition", () => {
    expect(parseGuardianIdBackfillOptions(url, [scope])).toMatchObject({
      apply: false,
      editionId,
    });
    expect(() => parseGuardianIdBackfillOptions(url, [])).toThrow("edition-id");
    expect(() => parseGuardianIdBackfillOptions(url, [scope, scope])).toThrow(
      "edition-id"
    );
  });
  it("requires exact credential-free target confirmation for every apply", () => {
    expect(() =>
      parseGuardianIdBackfillOptions(url, [scope, "--apply"])
    ).toThrow("--confirm-target=localhost:5433/isolated");
    expect(
      parseGuardianIdBackfillOptions(url, [
        scope,
        "--apply",
        "--confirm-target=localhost:5433/isolated",
      ]).apply
    ).toBe(true);
    expect(() =>
      parseGuardianIdBackfillOptions(url, [
        scope,
        "--apply",
        "--confirm-target=localhost:5432/isolated",
      ])
    ).toThrow();
  });
  it("rejects unconfirmed remote reads, routing overrides, and conflicting modes", () => {
    expect(() =>
      parseGuardianIdBackfillOptions(url.replace("localhost", "remote"), [
        scope,
      ])
    ).toThrow("Remote");
    expect(() =>
      parseGuardianIdBackfillOptions(`${url}?host=remote`, [scope])
    ).toThrow("routing");
    expect(() =>
      parseGuardianIdBackfillOptions(url, [scope, "--apply", "--dry-run"])
    ).toThrow();
  });
});

function fixture() {
  const dialect = new PgDialect();
  const editions = [
    { id: editionId, year: 2027, lifecycle: "live", nextGuardianSequence: 1 },
    { id: "other", year: 2028, lifecycle: "live", nextGuardianSequence: 1 },
  ];
  const members = [
    {
      id: "first",
      editionId,
      kind: "guardian",
      state: "active",
      humanId: null as string | null,
    },
    {
      id: "existing",
      editionId,
      kind: "guardian",
      state: "active",
      humanId: "KALG-2027-0002",
    },
    {
      id: "historical",
      editionId,
      kind: "guardian",
      state: "archived",
      humanId: "KALG-2027-0010",
    },
    {
      id: "archived-missing",
      editionId,
      kind: "guardian",
      state: "archived",
      humanId: null,
    },
    {
      id: "volunteer",
      editionId,
      kind: "volunteer",
      state: "active",
      humanId: null,
    },
    {
      id: "second",
      editionId,
      kind: "guardian",
      state: "active",
      humanId: null,
    },
    {
      id: "foreign",
      editionId: "other",
      kind: "guardian",
      state: "active",
      humanId: null,
    },
  ];
  const writes: unknown[] = [];
  const order: string[] = [];
  let tail = Promise.resolve();
  const database = {
    transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      let release: (() => void) | undefined;
      const tx = {
        select: () => ({
          from: (table: unknown) => ({
            where: (condition: SQL) => {
              const [id, membershipId] = dialect.sqlToQuery(condition).params;
              const selectedMembers = () =>
                members.filter(
                  (member) =>
                    member.editionId === id &&
                    (!membershipId || member.id === membershipId)
                );
              return {
                then: (resolve: (value: unknown) => void) =>
                  resolve(selectedMembers()),
                for: async (mode: string) => {
                  if (table === kalakritiEditionMembership)
                    return selectedMembers();
                  const previous = tail;
                  tail = new Promise<void>((resolve) => {
                    release = resolve;
                  });
                  await previous;
                  order.push(`lock:${mode}`);
                  expect(table).toBe(kalakritiEdition);
                  return editions.filter((edition) => edition.id === id);
                },
                orderBy: async () => {
                  order.push("memberships");
                  expect(table).toBe(kalakritiEditionMembership);
                  return members.filter((member) => member.editionId === id);
                },
              };
            },
          }),
        }),
        update: (table: unknown) => ({
          set: (values: Record<string, unknown>) => ({
            where: (condition: SQL) => {
              const id = dialect.sqlToQuery(condition).params[0];
              const apply = () => {
                const row =
                  table === kalakritiEdition
                    ? editions.find((entry) => entry.id === id)!
                    : members.find((entry) => entry.id === id)!;
                writes.push({ id, ...values });
                Object.assign(row, values);
                return [{ id }];
              };
              return {
                then: (resolve: (value: unknown) => void) => resolve(apply()),
                returning: async () => apply(),
              };
            },
          }),
        }),
      };
      try {
        return await callback(tx);
      } finally {
        release?.();
      }
    },
  };
  return {
    database: database as never,
    editions,
    members,
    writes,
    order,
    allocate: (membershipId: string, targetEdition = editionId) =>
      database.transaction((tx) =>
        ensureKalakritiGuardianHumanId(tx as never, targetEdition, membershipId)
      ),
  };
}

describe("atomic Guardian yearly ID allocation", () => {
  it("allocates once under the Edition lock and preserves retry/reactivation IDs", async () => {
    const state = fixture();
    expect(await state.allocate("first")).toBe("KALG-2027-0011");
    const count = state.writes.length;
    expect(await state.allocate("first")).toBe("KALG-2027-0011");
    state.members[0]!.state = "archived";
    await expect(state.allocate("first")).rejects.toThrow("Archived Guardians");
    state.members[0]!.state = "active";
    expect(await state.allocate("first")).toBe("KALG-2027-0011");
    expect(state.writes).toHaveLength(count);
  });
  it("serializes two Guardian allocations without changing other sequences", async () => {
    const state = fixture();
    expect(
      await Promise.all([state.allocate("first"), state.allocate("second")])
    ).toEqual(["KALG-2027-0011", "KALG-2027-0012"]);
    expect(state.editions[0]!.nextGuardianSequence).toBe(13);
    expect(state.editions[1]!.nextGuardianSequence).toBe(1);
  });
  it("fails closed for wrong kind, wrong Edition and archived Edition", async () => {
    const state = fixture();
    await expect(state.allocate("volunteer")).rejects.toThrow(
      "Guardian membership not found"
    );
    await expect(state.allocate("first", "other")).rejects.toThrow(
      "Guardian membership not found"
    );
    state.editions[0]!.lifecycle = "archived";
    await expect(state.allocate("first")).rejects.toThrow(
      "Edition is archived"
    );
    expect(state.writes).toEqual([]);
  });
});

describe("explicit Guardian yearly ID backfill", () => {
  it("dry-runs only active missing Guardians in the requested Edition without writes", async () => {
    const state = fixture();
    expect(
      await backfillKalakritiGuardianIds(state.database, {
        editionId,
        apply: false,
        now: 1000,
      })
    ).toEqual({ candidates: 2, updated: 0 });
    expect(state.writes).toEqual([]);
    expect(state.order).toEqual(["lock:update", "memberships"]);
  });
  it("preserves existing and archived IDs, assigns in creation order, and is idempotent", async () => {
    const state = fixture();
    expect(
      await backfillKalakritiGuardianIds(state.database, {
        editionId,
        apply: true,
        now: 1000,
      })
    ).toEqual({ candidates: 2, updated: 2 });
    expect(state.members.map((member) => member.humanId)).toEqual([
      "KALG-2027-0011",
      "KALG-2027-0002",
      "KALG-2027-0010",
      null,
      null,
      "KALG-2027-0012",
      null,
    ]);
    expect(state.editions[0]!.nextGuardianSequence).toBe(13);
    expect(
      await backfillKalakritiGuardianIds(state.database, {
        editionId,
        apply: true,
        now: 2000,
      })
    ).toEqual({ candidates: 0, updated: 0 });
    expect(state.writes).toHaveLength(3);
  });
  it("serializes simultaneous applies without duplicate or recycled IDs", async () => {
    const state = fixture();
    const results = await Promise.all([
      backfillKalakritiGuardianIds(state.database, {
        editionId,
        apply: true,
        now: 1000,
      }),
      backfillKalakritiGuardianIds(state.database, {
        editionId,
        apply: true,
        now: 1000,
      }),
    ]);
    expect(results.map((result) => result.updated)).toEqual([2, 0]);
    expect(state.editions[0]!.nextGuardianSequence).toBe(13);
  });
  it("isolates another Edition's sequence", async () => {
    const state = fixture();
    await backfillKalakritiGuardianIds(state.database, {
      editionId: "other",
      apply: true,
      now: 1000,
    });
    expect(
      state.members.find((member) => member.id === "foreign")!.humanId
    ).toBe("KALG-2028-0001");
    expect(state.editions[0]!.nextGuardianSequence).toBe(1);
  });
});
