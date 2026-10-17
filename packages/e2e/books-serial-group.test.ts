import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { exclusiveLastPatterns } from "./project-selection";

/*
 * Matching a year's audited figures freezes it, and closing it does too,
 * while other specs on the same stack database keep posting into it. So
 * every test that posts into the books and waits on the result, or matches
 * the year, lives in the serial "Books (treasurer)" group of
 * tests/finance/books.spec.ts (a stack partition keeps a spec file whole),
 * and every test that closes it lives in tests/finance/books-year-close.spec.ts,
 * which runs last, alone. This fails when a spec elsewhere uses those steps.
 */

const BOOKS_SPEC = "finance/books.spec.ts";
const YEAR_CLOSE_SPEC = "finance/books-year-close.spec.ts";
const testsDir = join(import.meta.dirname, "tests");

const CLOSE_YEAR = {
  pattern: /["'`]close-year/,
  what: "the close-year helper steps",
};
const SERIAL_GROUP: readonly { pattern: RegExp; what: string }[] = [
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

test("keeps every spec that posts into, closes or matches the year in the books specs", () => {
  const offenders: string[] = [];
  for (const file of specs(testsDir)) {
    const name = relative(testsDir, file);
    if (name === BOOKS_SPEC || name === YEAR_CLOSE_SPEC) {
      continue;
    }
    const source = readFileSync(file, "utf8");
    for (const { pattern, what } of [CLOSE_YEAR, ...SERIAL_GROUP]) {
      if (pattern.test(source)) {
        offenders.push(`${name} uses ${what}`);
      }
    }
  }
  expect(offenders).toEqual([]);
});

test("the books spec holds the posting steps in one serial group, and never closes the year", () => {
  const source = readFileSync(join(testsDir, BOOKS_SPEC), "utf8");
  expect(source).toContain('test.describe("Books (treasurer)"');
  expect(source).toContain('test.describe.configure({ mode: "serial" })');
  for (const { pattern } of SERIAL_GROUP) {
    expect(pattern.test(source)).toBe(true);
  }
  expect(CLOSE_YEAR.pattern.test(source)).toBe(false);
});

test("the year close spec closes the year and runs last, alone", () => {
  const source = readFileSync(join(testsDir, YEAR_CLOSE_SPEC), "utf8");
  expect(CLOSE_YEAR.pattern.test(source)).toBe(true);
  expect(
    exclusiveLastPatterns.some((pattern) => pattern.test(`/${YEAR_CLOSE_SPEC}`))
  ).toBe(true);
});
