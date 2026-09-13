import { expect, test } from "bun:test";

import { partitionSpecs } from "./partition-specs";

const listed = (project: string, spec: string, title: string, line = 1) =>
  `[${project}] › ${spec}:${line}:2 › ${title}`;

test("keeps every role for a spec together and returns every non-setup row once", () => {
  const rows = [
    listed("setup", "global-setup.ts", "setup"),
    listed("admin", "shared/a.spec.ts", "Admin case"),
    listed("volunteer", "shared/a.spec.ts", "Volunteer case", 10),
    listed("admin", "other/b.spec.ts", "Case"),
    listed("super_admin", "other/c.spec.ts", "Case"),
  ];
  const result = partitionSpecs(rows, {});
  expect(result.flatMap((partition) => partition.lines).sort()).toEqual(
    rows.slice(1).sort()
  );
  expect(
    result.find((partition) => partition.lines.includes(rows[1]))?.lines
  ).toContain(rows[2]);
  expect(result.reduce((sum, partition) => sum + partition.totalMs, 0)).toBe(
    40_000
  );
});

test("uses exact duration, normalized location lookup, then a 10s fallback", () => {
  const exact = listed("admin", "a.spec.ts", "exact");
  const moved = listed("volunteer", "b.spec.ts", "moved", 50);
  const unknown = listed("admin", "c.spec.ts", "unknown");
  const duration = {
    [exact]: 800,
    [listed("volunteer", "b.spec.ts", "moved", 20)]: 1200,
  };
  const result = partitionSpecs([exact, moved, unknown], duration);
  expect(result.reduce((sum, partition) => sum + partition.totalMs, 0)).toBe(
    12_000
  );
  expect(result.flatMap((partition) => partition.lines).sort()).toEqual(
    [exact, moved, unknown].sort()
  );
});

test("balances the serial invariant lane before other work", () => {
  const first = listed("kalakriti_release_invariants", "slow.spec.ts", "slow");
  const second = listed(
    "kalakriti_release_invariants",
    "medium.spec.ts",
    "medium"
  );
  const third = listed(
    "kalakriti_release_invariants",
    "short.spec.ts",
    "short"
  );
  const other = listed("admin", "other.spec.ts", "other");
  const result = partitionSpecs([first, second, third, other], {
    [first]: 60_000,
    [second]: 40_000,
    [third]: 20_000,
    [other]: 50_000,
  });
  expect(result[0].invariantMs).toBe(60_000);
  expect(result[1].invariantMs).toBe(60_000);
  expect(result[0].lines).toEqual([first, other]);
  expect(result[1].lines).toEqual([second, third]);
  expect(result[0].totalMs).toBe(110_000);
  expect(result[1].totalMs).toBe(60_000);
});

test("keeps a file with invariant and other role cases on one stack", () => {
  const invariant = listed(
    "kalakriti_release_invariants",
    "same.spec.ts",
    "invariant"
  );
  const admin = listed("admin", "same.spec.ts", "admin case", 3);
  const result = partitionSpecs([invariant, admin], {
    [invariant]: 7000,
    [admin]: 2000,
  });
  expect(result[0]).toEqual({
    lines: [invariant, admin],
    totalMs: 9000,
    invariantMs: 7000,
  });
  expect(result[1].lines).toEqual([]);
});

test("schedules zero-duration invariant groups before other specs", () => {
  const invariant = listed(
    "kalakriti_release_invariants",
    "invariant.spec.ts",
    "zero"
  );
  const other = listed("admin", "other.spec.ts", "other");
  const result = partitionSpecs([other, invariant], {
    [invariant]: 0,
    [other]: 10_000,
  });
  expect(result[0].lines).toEqual([invariant, other]);
});

test("ties produce deterministic assignments regardless of input order", () => {
  const a = listed("admin", "a.spec.ts", "a");
  const b = listed("admin", "b.spec.ts", "b");
  const c = listed("admin", "c.spec.ts", "c");
  expect(partitionSpecs([c, b, a], {})).toEqual(partitionSpecs([a, b, c], {}));
});

test("rejects malformed rows and duplicate rows", () => {
  expect(() => partitionSpecs(["Listing tests:"], {})).toThrow(
    /Invalid Playwright test-list row/
  );
  expect(() => partitionSpecs(["[admin] › a.spec.ts › title"], {})).toThrow(
    /Invalid Playwright test-list row/
  );
  expect(() => partitionSpecs(["[setup] malformed"], {})).toThrow(
    /Invalid Playwright test-list row/
  );
  const line = listed("admin", "a.spec.ts", "same");
  expect(() => partitionSpecs([line, line], {})).toThrow(
    /Duplicate Playwright test-list row/
  );
});
