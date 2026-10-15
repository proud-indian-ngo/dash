import { describe, expect, it, vi } from "vitest";

vi.mock("@pi-dash/env/server", () => ({ env: {} }));

const { decryptSecretWith, encryptSecretWith, keyFingerprint } =
  await import("./encryption");
const { importHashWith } = await import("./import-hash");
const {
  formatReports,
  matchEncrypted,
  needsAction,
  planEncrypted,
  planHashes,
} = await import("./secret-keys");

const CURRENT = Buffer.alloc(32, 1);
const OLD = Buffer.alloc(32, 2);
const OTHER = Buffer.alloc(32, 3);
const ctx = (id: string) => `party_bank_account.account_number:${id}`;

describe("old-key detection", () => {
  it("tells current, old and unknown keys apart", () => {
    const keys = { current: CURRENT, old: OLD };
    expect(
      matchEncrypted(
        keys,
        encryptSecretWith(CURRENT, "1234", ctx("a")),
        ctx("a")
      )
    ).toBe("current");
    expect(
      matchEncrypted(keys, encryptSecretWith(OLD, "1234", ctx("a")), ctx("a"))
    ).toBe("old");
    expect(
      matchEncrypted(keys, encryptSecretWith(OTHER, "1234", ctx("a")), ctx("a"))
    ).toBe("neither");
    expect(matchEncrypted(keys, "not-encrypted", ctx("a"))).toBe("neither");
  });

  it("reports an old-key value as unreadable when no old key is given", () => {
    const stored = encryptSecretWith(OLD, "1234", ctx("a"));
    expect(
      matchEncrypted({ current: CURRENT, old: null }, stored, ctx("a"))
    ).toBe("neither");
  });

  it("does not accept a value moved to another row", () => {
    const stored = encryptSecretWith(OLD, "1234", ctx("a"));
    expect(
      matchEncrypted({ current: CURRENT, old: OLD }, stored, ctx("b"))
    ).toBe("neither");
  });

  it("fingerprints keys without revealing them", () => {
    expect(keyFingerprint(CURRENT)).toMatch(/^[0-9a-f]{8}$/);
    expect(keyFingerprint(CURRENT)).not.toBe(keyFingerprint(OLD));
  });
});

describe("rekey plan", () => {
  const keys = { current: CURRENT, old: OLD };
  const rows = [
    { id: "a", value: encryptSecretWith(CURRENT, "111111111111", ctx("a")) },
    { id: "b", value: encryptSecretWith(OLD, "222222222222", ctx("b")) },
    { id: "c", value: encryptSecretWith(OTHER, "333333333333", ctx("c")) },
  ];

  it("counts without planning writes on a check", () => {
    const { report, updates } = planEncrypted("col", rows, ctx, keys, false);
    expect(report).toMatchObject({
      current: 1,
      neither: 1,
      neitherIds: ["c"],
      old: 1,
      total: 3,
    });
    expect(updates).toEqual([]);
    expect(needsAction([report])).toBe(true);
  });

  it("re-encrypts only old-key values, under the current key and same context", () => {
    const { updates } = planEncrypted("col", rows, ctx, keys, true);
    expect(updates).toHaveLength(1);
    const [update] = updates;
    expect(update?.id).toBe("b");
    expect(update?.previous).toBe(rows[1]?.value);
    expect(decryptSecretWith(CURRENT, update?.value ?? "", ctx("b"))).toBe(
      "222222222222"
    );
  });

  it("is idempotent: a second run after applying the plan changes nothing", () => {
    const first = planEncrypted("col", rows, ctx, keys, true);
    const applied = rows.map((row) => ({
      id: row.id,
      value: first.updates.find((u) => u.id === row.id)?.value ?? row.value,
    }));
    const second = planEncrypted("col", applied, ctx, keys, true);
    expect(second.updates).toEqual([]);
    expect(second.report).toMatchObject({ current: 2, neither: 1, old: 0 });
    // The value neither key opens is left exactly as it was.
    expect(applied[2]?.value).toBe(rows[2]?.value);
  });

  it("rehashes keyed hashes only the old key reproduces, once", () => {
    const recompute = (key: Buffer) => importHashWith(key, "raw", "cells");
    const hashRows = [
      { id: "x", recompute, stored: recompute(CURRENT) },
      { id: "y", recompute, stored: recompute(OLD) },
    ];
    const first = planHashes("hash", hashRows, keys, true);
    expect(first.updates).toEqual([
      { id: "y", previous: recompute(OLD), value: recompute(CURRENT) },
    ]);
    const second = planHashes(
      "hash",
      hashRows.map((row) => ({ ...row, stored: recompute(CURRENT) })),
      keys,
      true
    );
    expect(second.updates).toEqual([]);
    expect(needsAction([second.report])).toBe(false);
  });

  it("prints counts and row IDs, never values", () => {
    const { report } = planEncrypted("col", rows, ctx, keys, false);
    const text = formatReports([report]);
    expect(text).toContain("3 total, 1 current key, 1 old key, 1 neither key");
    expect(text).toContain("c");
    expect(text).not.toContain("222222222222");
    expect(text).not.toContain(rows[1]?.value);
  });
});
