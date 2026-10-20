import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { singleLiveEditionSpecs } from "./project-selection";

const testsDir = join(import.meta.dirname, "tests");
const LOCK = /lock: "single-live-edition"/;

function specs(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      return specs(full);
    }
    return entry.name.endsWith(".spec.ts") ? [full] : [];
  });
}

test("singleLiveEditionSpecs lists exactly the specs holding the single-live-edition lock", () => {
  const locked = specs(testsDir)
    .filter((file) => LOCK.test(readFileSync(file, "utf8")))
    .map((file) => relative(testsDir, file))
    .sort();
  expect(locked).toEqual([...singleLiveEditionSpecs].sort());
});
