import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/*
 * Matching a year's audited figures freezes it, and closing it does too,
 * while other specs on the same stack database keep posting into it. So
 * every test that posts into the books and waits on the result, or closes
 * or matches the year, lives in the serial "Books (treasurer)" group of
 * tests/finance/books.spec.ts (a stack partition keeps a spec file whole).
 * This fails when a spec elsewhere uses those steps.
 */

const BOOKS_SPEC = "finance/books.spec.ts";
const testsDir = join(import.meta.dirname, "tests");

const FORBIDDEN: readonly { pattern: RegExp; what: string }[] = [
  { pattern: /["'`]close-year/, what: "the close-year helper steps" },
  { pattern: /["'`]post-audited["'`]/, what: "the post-audited helper step" },
  {
    pattern: /["'`]reverse-audited["'`]/,
    what: "the reverse-audited helper step",
  },
  { pattern: /["'`]postings["'`]/, what: "the postings helper step" },
  { pattern: /Post pending/, what: "Books → Post pending" },
];

function specs(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      return specs(full);
    }
    return entry.name.endsWith(".spec.ts") ? [full] : [];
  });
}

test("keeps every spec that posts into, closes or matches the year in the books serial group", () => {
  const offenders: string[] = [];
  for (const file of specs(testsDir)) {
    const name = relative(testsDir, file);
    if (name === BOOKS_SPEC) {
      continue;
    }
    const source = readFileSync(file, "utf8");
    for (const { pattern, what } of FORBIDDEN) {
      if (pattern.test(source)) {
        offenders.push(`${name} uses ${what}`);
      }
    }
  }
  expect(offenders).toEqual([]);
});

test("the books spec still holds them, in one serial group", () => {
  const source = readFileSync(join(testsDir, BOOKS_SPEC), "utf8");
  expect(source).toContain('test.describe("Books (treasurer)"');
  expect(source).toContain('test.describe.configure({ mode: "serial" })');
  for (const { pattern } of FORBIDDEN) {
    expect(pattern.test(source)).toBe(true);
  }
});
