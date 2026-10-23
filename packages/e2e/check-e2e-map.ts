#!/usr/bin/env bun
/**
 * Fails when test-areas.ts drifts from the repository: a glob, app name or
 * named pattern that matches no file, an area that isn't a spec folder, a
 * spec folder without an area, an `@e2e-areas` comment naming an unknown
 * area, or a seed module under helpers/seed/ that seedReaders doesn't list
 * correctly.
 */

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { appGlobs, areaNames, matchesNamed, specAreasOf } from "./select-tests";
import {
  areas,
  fullSuite,
  generated,
  ignored,
  layout,
  registries,
  seedReaders,
  signing,
  signingHelper,
} from "./test-areas";

const root = path.resolve(import.meta.dirname, "../..");
const testsDir = path.join(import.meta.dirname, "tests");
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard"],
  { cwd: root, encoding: "utf8" }
)
  .split("\n")
  .filter(Boolean);
const problems: string[] = [];

const matchesAny = (globs: string[]) => {
  const compiled = globs.map((glob) => new Bun.Glob(glob));
  return files.some((file) => compiled.some((glob) => glob.match(file)));
};

const lists: Record<string, string[]> = {
  fullSuite,
  generated: generated.flatMap(({ files: f, from }) => [f, from]),
  ignored,
  layout,
  registries,
  signing: [...signing, signingHelper],
};
for (const [list, globs] of Object.entries(lists)) {
  for (const glob of globs) {
    if (!matchesAny([glob])) {
      problems.push(`${list}: ${glob} matches no file`);
    }
  }
}

for (const name of areaNames) {
  const area: { app?: string[]; named?: string[]; globs?: string[] } =
    areas[name];
  for (const app of area.app ?? []) {
    if (!matchesAny(appGlobs(app))) {
      problems.push(`${name}: app ${app} matches no file`);
    }
  }
  for (const pattern of area.named ?? []) {
    if (!files.some((file) => matchesNamed(pattern, file))) {
      problems.push(`${name}: named ${pattern} matches no file`);
    }
  }
  for (const glob of area.globs ?? []) {
    if (!matchesAny([glob])) {
      problems.push(`${name}: ${glob} matches no file`);
    }
  }
}

const folders = readdirSync(testsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
for (const folder of folders.filter((f) => !(f in areas))) {
  problems.push(`spec folder tests/${folder} has no area`);
}
for (const name of areaNames.filter((a) => !folders.includes(a))) {
  problems.push(`area ${name} is not a spec folder`);
}

for (const file of files) {
  if (file.startsWith("packages/e2e/tests/") && file.endsWith(".spec.ts")) {
    const spec = path.relative(testsDir, path.join(root, file));
    const source = readFileSync(path.join(root, file), "utf8");
    for (const area of specAreasOf(spec, source).slice(1)) {
      if (!(area in areas)) {
        problems.push(`${spec}: @e2e-areas names unknown area ${area}`);
      }
    }
  }
}

const SEED_DIR = "packages/e2e/helpers/seed/";
const seedModules = files
  .filter((file) => file.startsWith(SEED_DIR) && file.endsWith(".ts"))
  .map((file) => file.slice(SEED_DIR.length, -".ts".length))
  .filter((name) => name !== "core");
for (const name of seedModules.filter((m) => !(m in seedReaders))) {
  problems.push(`seedReaders: helpers/seed/${name}.ts has no entry`);
}
for (const [name, readers] of Object.entries(seedReaders)) {
  if (!seedModules.includes(name)) {
    problems.push(`seedReaders: helpers/seed/${name}.ts doesn't exist`);
  }
  for (const area of [name, ...readers].filter((a) => !(a in areas))) {
    problems.push(`seedReaders: ${name} names unknown area ${area}`);
  }
}

if (problems.length > 0) {
  console.error(`test-areas.ts is out of date:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
