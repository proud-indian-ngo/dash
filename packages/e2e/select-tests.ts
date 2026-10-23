#!/usr/bin/env bun
/**
 * Chooses the E2E specs a diff can affect, by the map in test-areas.ts.
 *
 * Usage:
 *   bun run select-tests.ts <base> <head> <out.json>
 *     Writes { all, specs } for shard-by-duration.ts and explains each
 *     changed file in $GITHUB_STEP_SUMMARY. Any error selects every spec.
 *   bun run select-tests.ts --shadow <base> <head> <failures-dir>
 *     Warns about each spec that failed in a full run (any `.failed-specs.json`
 *     under the directory) but that the planner would not have selected.
 */

import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  areas,
  fullSuite,
  generated,
  ignored,
  layout,
  layoutAreas,
  projectSelection,
  registries,
  signing,
  signingHelper,
} from "./test-areas";

const ROOT = path.resolve(import.meta.dirname, "../..");
const TESTS = "packages/e2e/tests/";
const AREAS_COMMENT = /^\/\/ @e2e-areas (.+)$/;
const SEED_AREA = /^packages\/e2e\/helpers\/seed\/([\w-]+)\.ts$/;
const DOMAIN =
  /^(?:packages\/[^/]+\/src|apps\/web\/src\/(?:functions|lib|hooks))\/(.+)$/;
const SOURCE = /\.(?:ts|tsx|js|jsx|mjs)$/;
// Runtime code: app and package sources, minus scripts, configs and tests.
const GRAPH =
  /^(?:apps\/web\/(?:src|server)\/|packages\/(?!e2e\/)[^/]+\/(?!scripts\/)[^/]+\/)/;
const NOT_RUNTIME =
  /\.test\.|\.test-helper\.|\.test-fixtures\.|test-utils|\/__tests__\//;
// Specifiers that must resolve to a repository file; bare package names may
// be third-party, and `virtual:` and similar are bundler modules.
const LOCAL_SPECIFIER = /^(?:\.|\/|@\/|@pi-dash\/)/;
// Relative paths in string literals, such as a helper a spec runs by path.
const PATH_LITERAL =
  /["'`]((?:\.{1,2}\/)*[\w-]+(?:\/[\w.-]+)*\.(?:ts|tsx))["'`]/g;
// The one hunk of a full-context diff starts at line 1 on both sides.
const WHOLE_FILE_HUNK = /^@@ -(?:0,0|1(?:,\d+)?) \+(?:0,0|1(?:,\d+)?) @@/;
const SPEC_LINE = /^\s*"([\w-]+\/[\w.-]+\.spec\.ts)",?$/;
const LIST_START = /^(?:export )?const (\w+)/;
// project-selection.ts lists that keep their specs apart from the rest.
const APART_LISTS = new Set(["exclusiveLastSpecs", "singleLiveEditionSpecs"]);
const STATEMENT_START =
  /^(?:import|export)\s+(?:type\s+)?(?:\{|\*|\w+\s*(?:,|from\b))/;
const FROM = /\bfrom\s+["']([^"']+)["']/;
// An object entry that lists one binding: `fund: fundMutators,` or `fund,`.
const ENTRY = /^(?:\w+:\s*)?(\w+),?$/;
const COMMENT = /^(?:\/\/|\/\*|\*)/;

export type AreaName = keyof typeof areas;
export const areaNames = Object.keys(areas) as AreaName[];

export interface Change {
  path: string;
  /** The path before a rename. */
  oldPath?: string;
  deleted?: boolean;
  /** A full-context diff, for the files whose lines decide the selection. */
  diff?: string;
}

export interface Repo {
  /** Spec (relative to tests/) to its areas. */
  specAreas: Map<string, Set<string>>;
  /** Repository file to the specs whose import closure or path literals reach it. */
  specRefs: Map<string, Set<string>>;
  /** E2E files only performance benchmarks reach. */
  perfOnly: Set<string>;
  /** Runtime file to the files that import it. */
  importers: Map<string, Set<string>>;
  /** `importer -> specifier` for local imports that did not resolve. */
  unresolved: string[];
}

export interface Plan {
  all: boolean;
  specs: string[];
  /** Why each changed file selects what it does; `full` marks a full-suite trigger. */
  reasons: { path: string; reason: string; full?: true }[];
}

interface Verdict {
  reason: string;
  all?: true;
  specs?: Iterable<string>;
}

const globMatcher = (patterns: readonly string[]) => {
  const compiled = patterns.map((pattern) => new Bun.Glob(pattern));
  return (file: string) => compiled.some((glob) => glob.match(file));
};

/** The paths an `app` name covers. */
export const appGlobs = (name: string) => [
  `apps/web/src/routes/_app/${name}/**`,
  `apps/web/src/routes/_app/${name}.tsx`,
  `apps/web/src/routes/api/${name}/**`,
  `apps/web/src/routes/api/${name}.ts`,
  `apps/web/src/components/${name}/**`,
];

/** Whether a `named` pattern matches a segment of a domain file's path. */
export function matchesNamed(pattern: string, file: string): boolean {
  const rest = DOMAIN.exec(file)?.[1];
  if (!rest) {
    return false;
  }
  const glob = new Bun.Glob(pattern);
  return rest.split("/").some((segment) => glob.match(segment));
}

const areaMatchers = areaNames.map((name) => {
  const area: { app?: string[]; named?: string[]; globs?: string[] } =
    areas[name];
  const byGlob = globMatcher([
    ...(area.app ?? []).flatMap(appGlobs),
    ...(area.globs ?? []),
  ]);
  const named = (area.named ?? []).map((pattern) => new Bun.Glob(pattern));
  return {
    name,
    matches: (file: string) => {
      if (byGlob(file)) {
        return true;
      }
      const rest = DOMAIN.exec(file)?.[1];
      return (
        !!rest &&
        rest
          .split("/")
          .some((segment) => named.some((glob) => glob.match(segment)))
      );
    },
  };
});

const isIgnored = globMatcher(ignored);
const isFullSuite = globMatcher(fullSuite);
const isLayout = globMatcher(layout);
const isRegistry = globMatcher(registries);
const needsDiff = (file: string) =>
  isRegistry(file) || file === projectSelection;
const isSigning = globMatcher(signing);
const generatedRules = generated.map((rule) => ({
  ...rule,
  isFile: globMatcher([rule.files]),
  isSource: globMatcher([rule.from]),
}));

const areasOf = (file: string) =>
  areaMatchers.filter(({ matches }) => matches(file)).map(({ name }) => name);

function specsOfAreas(repo: Repo, names: Iterable<string>): string[] {
  const wanted = new Set(names);
  return [...repo.specAreas]
    .filter(([, specAreas]) => [...specAreas].some((a) => wanted.has(a)))
    .map(([spec]) => spec);
}

/** Areas a file's importers reach, or the full suite when a path leads nowhere covered. */
function walkImporters(file: string, repo: Repo): Verdict {
  const found = new Set<string>();
  const seen = new Set([file]);
  const queue = [file];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    const importers = repo.importers.get(current);
    if (!importers?.size) {
      return {
        all: true,
        reason:
          current === file
            ? "no area and no runtime importers"
            : `reaches ${current}, which no area covers`,
      };
    }
    for (const importer of importers) {
      if (seen.has(importer)) {
        continue;
      }
      seen.add(importer);
      if (isRegistry(importer)) {
        return { all: true, reason: `reaches registry ${importer}` };
      }
      if (isFullSuite(importer)) {
        return { all: true, reason: `reaches ${importer}` };
      }
      const hit = isLayout(importer) ? [...layoutAreas] : areasOf(importer);
      if (hit.length > 0) {
        for (const name of hit) {
          found.add(name);
        }
      } else {
        queue.push(importer);
      }
    }
  }
  if (found.size === 0) {
    return { all: true, reason: "imported only in a cycle no area covers" };
  }
  const names = [...found].sort();
  return {
    reason: `imported by ${names.join(", ")}`,
    specs: specsOfAreas(repo, names),
  };
}

interface DiffLine {
  sign: " " | "+" | "-";
  text: string;
}

/** The lines of a one-hunk full-context diff, or undefined for anything else. */
function parseFullDiff(diff: string | undefined): DiffLine[] | undefined {
  const lines = diff?.split("\n") ?? [];
  const hunks = lines.filter((line) => line.startsWith("@@ "));
  if (hunks.length !== 1 || !WHOLE_FILE_HUNK.test(hunks[0] as string)) {
    return undefined;
  }
  const out: DiffLine[] = [];
  for (const line of lines.slice(lines.indexOf(hunks[0] as string) + 1)) {
    const sign = line[0];
    if (line === "" || sign === "\\") {
      continue;
    }
    if (sign !== " " && sign !== "+" && sign !== "-") {
      return undefined;
    }
    out.push({ sign, text: line.slice(1) });
  }
  return out;
}

/** The specs project-selection.ts's changed lines name. */
function classifyProjectLists(diff: string | undefined, repo: Repo): Verdict {
  const lines = parseFullDiff(diff);
  if (!lines) {
    return { all: true, reason: "project lists: diff unreadable" };
  }
  const specs = new Set<string>();
  let list = "";
  for (const { sign, text } of lines) {
    list = LIST_START.exec(text)?.[1] ?? list;
    if (sign === " " || text.trim() === "") {
      continue;
    }
    const spec = SPEC_LINE.exec(text)?.[1];
    if (!spec) {
      return {
        all: true,
        reason: "project lists: a changed line names no spec",
      };
    }
    if (sign === "-" && APART_LISTS.has(list)) {
      return { all: true, reason: `project lists: ${spec} leaves ${list}` };
    }
    if (repo.specAreas.has(spec)) {
      specs.add(spec);
    }
  }
  return { reason: "project lists", specs };
}

interface ModuleStatement {
  specifier: string;
  bindings: string[];
}

/** Each line's import or export statement that names a module. */
function moduleStatements(lines: string[]): Map<number, ModuleStatement> {
  const byLine = new Map<number, ModuleStatement>();
  for (let i = 0; i < lines.length; i++) {
    if (!STATEMENT_START.test(lines[i] as string)) {
      continue;
    }
    const end = lines.findIndex((line, j) => j >= i && FROM.test(line));
    if (end === -1) {
      continue;
    }
    const text = lines.slice(i, end + 1).join("\n");
    const named = /\{([^}]*)\}/.exec(text)?.[1] ?? "";
    const bindings = named
      .split(",")
      .map((name) =>
        name
          .trim()
          .replace(/^type\s+/, "")
          .split(/\s+as\s+/)
          .at(-1)
      )
      .filter((name): name is string => !!name);
    const defaultName = /^import\s+(?!type\b)(\w+)/.exec(text)?.[1];
    const statement = {
      bindings: defaultName ? [...bindings, defaultName] : bindings,
      specifier: FROM.exec(text)?.[1] as string,
    };
    for (let j = i; j <= end; j++) {
      byLine.set(j, statement);
    }
    i = end;
  }
  return byLine;
}

/** The modules a registry's changed import, export and entry lines name. */
function classifyRegistry(
  file: string,
  diff: string | undefined,
  changed: string[],
  repo: Repo
): Verdict {
  const lines = parseFullDiff(diff);
  if (!lines) {
    return { all: true, reason: "registry diff unreadable" };
  }
  const sides = {
    "+": moduleStatements(
      lines.filter((l) => l.sign !== "-").map((l) => l.text)
    ),
    "-": moduleStatements(
      lines.filter((l) => l.sign !== "+").map((l) => l.text)
    ),
  };
  const specifiers = new Set<string>();
  const index = { "+": 0, "-": 0 };
  for (const { sign, text } of lines) {
    if (sign === " ") {
      index["+"]++;
      index["-"]++;
      continue;
    }
    const at = index[sign]++;
    const line = text.trim();
    if (line === "" || COMMENT.test(line)) {
      continue;
    }
    const binding = ENTRY.exec(line)?.[1];
    const statement =
      sides[sign].get(at) ??
      [...sides[sign].values()].find(
        (s) => binding && s.bindings.includes(binding)
      );
    if (!statement) {
      return {
        all: true,
        reason: "changes a registry outside its imports and exports",
      };
    }
    specifiers.add(statement.specifier);
  }
  const specs: string[] = [];
  for (const specifier of specifiers) {
    let target: string | undefined;
    try {
      target = path.relative(
        ROOT,
        realpathSync(
          Bun.resolveSync(specifier, path.join(ROOT, path.dirname(file)))
        )
      );
    } catch {
      // A module deleted in the same diff is decided by its own change.
      const base = path.join(path.dirname(file), specifier);
      if (
        [".ts", ".tsx", "/index.ts"].some((ext) => changed.includes(base + ext))
      ) {
        continue;
      }
      return {
        all: true,
        reason: `registry names ${specifier}, which doesn't resolve`,
      };
    }
    if (target.startsWith("..") || target.includes("node_modules/")) {
      return { all: true, reason: `registry names package ${specifier}` };
    }
    const verdict = classify(target, "current", changed, repo);
    if (verdict.all) {
      return {
        all: true,
        reason: `registry names ${target}: ${verdict.reason}`,
      };
    }
    specs.push(...(verdict.specs ?? []));
  }
  return {
    reason: `registry names ${[...specifiers].join(", ") || "no module"}`,
    specs,
  };
}

function classify(
  file: string,
  kind: "current" | "renamed" | "deleted",
  changed: string[],
  repo: Repo,
  diff?: string
): Verdict {
  if (isIgnored(file)) {
    return { reason: "ignored" };
  }
  const rule = generatedRules.find(({ isFile }) => isFile(file));
  if (rule) {
    return changed.some(rule.isSource)
      ? { reason: `generated from ${rule.from}, changed here` }
      : { all: true, reason: `generated, but ${rule.from} is unchanged` };
  }
  if (isFullSuite(file)) {
    return { all: true, reason: "full-suite file" };
  }
  if (file === projectSelection || isRegistry(file)) {
    if (kind !== "current") {
      return { all: true, reason: `${kind} registry or project lists` };
    }
    return file === projectSelection
      ? classifyProjectLists(diff, repo)
      : classifyRegistry(file, diff, changed, repo);
  }
  if (isSigning(file)) {
    const signers = repo.specRefs.get(signingHelper) ?? [];
    return {
      reason: "signing service",
      specs: [...specsOfAreas(repo, ["governance"]), ...signers],
    };
  }
  if (file.startsWith(TESTS) && file.endsWith(".spec.ts")) {
    const spec = file.slice(TESTS.length);
    return kind === "current" && repo.specAreas.has(spec)
      ? { reason: "spec", specs: [spec] }
      : { reason: "spec removed" };
  }
  if (file.startsWith("packages/e2e/")) {
    const seedArea = SEED_AREA.exec(file)?.[1];
    if (seedArea && seedArea in areas) {
      return {
        reason: `seeds ${seedArea}`,
        specs: specsOfAreas(repo, [seedArea]),
      };
    }
    const refs = repo.specRefs.get(file);
    if (refs?.size) {
      return { reason: `used by ${refs.size} spec(s)`, specs: refs };
    }
    if (repo.perfOnly.has(file)) {
      return { reason: "used by benchmarks only" };
    }
    return kind === "renamed"
      ? { reason: "renamed; the new path decides" }
      : { all: true, reason: "E2E file no spec reaches" };
  }
  const direct = repo.specRefs.get(file) ?? [];
  if (isLayout(file)) {
    return {
      reason: "layout",
      specs: [...specsOfAreas(repo, layoutAreas), ...direct],
    };
  }
  const hit = areasOf(file);
  if (hit.length > 0) {
    return {
      reason: `area ${hit.join(", ")}`,
      specs: [...specsOfAreas(repo, hit), ...direct],
    };
  }
  if (kind === "renamed") {
    return { reason: "renamed; the new path decides" };
  }
  if (kind === "deleted") {
    return { all: true, reason: "deleted, and no area covers it" };
  }
  const walked = walkImporters(file, repo);
  return walked.all
    ? walked
    : { ...walked, specs: [...(walked.specs ?? []), ...direct] };
}

export function selectTests(changes: Change[], repo: Repo): Plan {
  const changed = changes.flatMap((c) =>
    c.oldPath ? [c.path, c.oldPath] : [c.path]
  );
  const reasons: Plan["reasons"] = [];
  const specs = new Set<string>();
  let all = false;
  for (const change of changes) {
    const entries: [string, "current" | "renamed" | "deleted", string?][] = [
      [change.path, change.deleted ? "deleted" : "current", change.diff],
    ];
    if (change.oldPath) {
      entries.push([change.oldPath, "renamed"]);
    }
    for (const [file, kind, diff] of entries) {
      const verdict = classify(file, kind, changed, repo, diff);
      reasons.push(
        verdict.all
          ? { full: true, path: file, reason: verdict.reason }
          : { path: file, reason: verdict.reason }
      );
      all ||= verdict.all === true;
      for (const spec of verdict.specs ?? []) {
        specs.add(spec);
      }
    }
  }
  return {
    all,
    reasons,
    specs: (all ? [...repo.specAreas.keys()] : [...specs]).sort(),
  };
}

/** Failed specs the plan would have skipped. */
export function shadowMisses(plan: Plan, failed: string[]): string[] {
  const selected = new Set(plan.specs);
  return plan.all ? [] : failed.filter((spec) => !selected.has(spec));
}

/** Parses `git diff --name-status -z` output. */
export function parseNameStatus(output: string): Change[] {
  const tokens = output.split("\0").filter(Boolean);
  const changes: Change[] = [];
  for (let i = 0; i < tokens.length;) {
    const status = tokens[i] as string;
    if (status.startsWith("R") || status.startsWith("C")) {
      const [from, to] = [tokens[i + 1] as string, tokens[i + 2] as string];
      changes.push(
        status.startsWith("R") ? { oldPath: from, path: to } : { path: to }
      );
      i += 3;
    } else {
      const file = tokens[i + 1] as string;
      changes.push(
        status === "D" ? { deleted: true, path: file } : { path: file }
      );
      i += 2;
    }
  }
  return changes;
}

export function changedFiles(base: string, head: string): Change[] {
  const git = (args: string[], paths: string[] = []) =>
    execFileSync(
      "git",
      ["diff", ...args, `${base}...${head}`, "--", ...paths],
      {
        cwd: ROOT,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      }
    );
  return parseNameStatus(git(["--name-status", "-z", "--find-renames"])).map(
    (change) =>
      needsDiff(change.path) && !(change.deleted || change.oldPath)
        ? { ...change, diff: git(["--unified=100000"], [change.path]) }
        : change
  );
}

function listFiles(root: string): string[] {
  return execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard"],
    { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  )
    .split("\n")
    .filter((file) => file && existsSync(path.join(root, file)));
}

/** Areas named by a spec's `// @e2e-areas` first line, after its folder's. */
export function specAreasOf(spec: string, source: string): string[] {
  const named = AREAS_COMMENT.exec(source.split("\n", 1)[0] ?? "")?.[1];
  return [spec.split("/")[0] as string, ...(named?.split(/\s+/) ?? [])];
}

export function loadRepo(root = ROOT): Repo {
  const transpilers = {
    ts: new Bun.Transpiler({ loader: "ts" }),
    tsx: new Bun.Transpiler({ loader: "tsx" }),
  };
  const files = listFiles(root);
  const relative = (abs: string) => path.relative(root, abs);
  const unresolved: string[] = [];

  function imports(file: string): string[] {
    const abs = path.join(root, file);
    const source = readFileSync(abs, "utf8");
    const out: string[] = [];
    const transpiler = file.endsWith(".tsx") ? transpilers.tsx : transpilers.ts;
    for (const { path: specifier } of transpiler.scanImports(source)) {
      let resolved: string;
      try {
        resolved = realpathSync(
          Bun.resolveSync(specifier.split("?")[0] as string, path.dirname(abs))
        );
      } catch {
        if (LOCAL_SPECIFIER.test(specifier)) {
          unresolved.push(`${file} -> ${specifier}`);
        }
        continue;
      }
      if (resolved.startsWith(root) && !resolved.includes("/node_modules/")) {
        out.push(relative(resolved));
      }
    }
    return out;
  }

  const importers = new Map<string, Set<string>>();
  for (const file of files) {
    if (!(GRAPH.test(file) && SOURCE.test(file)) || NOT_RUNTIME.test(file)) {
      continue;
    }
    for (const target of imports(file)) {
      const set = importers.get(target) ?? new Set();
      set.add(file);
      importers.set(target, set);
    }
  }

  // Everything a spec reaches inside packages/e2e, through imports and path
  // literals (helpers run as subprocesses), plus the outside files it imports.
  function closure(spec: string): Set<string> {
    const seen = new Set<string>();
    const queue = [spec];
    while (queue.length > 0) {
      const file = queue.shift() as string;
      if (seen.has(file)) {
        continue;
      }
      seen.add(file);
      if (!(file.startsWith("packages/e2e/") && SOURCE.test(file))) {
        continue;
      }
      const source = readFileSync(path.join(root, file), "utf8");
      const literals = [...source.matchAll(PATH_LITERAL)]
        .map((match) => path.join(path.dirname(file), match[1] as string))
        .filter((target) => existsSync(path.join(root, target)));
      queue.push(...imports(file), ...literals);
    }
    return seen;
  }

  const specAreas = new Map<string, Set<string>>();
  const specRefs = new Map<string, Set<string>>();
  const perfReached = new Set<string>();
  for (const file of files) {
    if (file.startsWith(TESTS) && file.endsWith(".spec.ts")) {
      const spec = file.slice(TESTS.length);
      const source = readFileSync(path.join(root, file), "utf8");
      specAreas.set(spec, new Set(specAreasOf(spec, source)));
      for (const reached of closure(file)) {
        const set = specRefs.get(reached) ?? new Set();
        set.add(spec);
        specRefs.set(reached, set);
      }
    } else if (file.startsWith("packages/e2e/perf/") && SOURCE.test(file)) {
      for (const reached of closure(file)) {
        perfReached.add(reached);
      }
    }
  }
  const perfOnly = new Set([...perfReached].filter((f) => !specRefs.has(f)));
  return { importers, perfOnly, specAreas, specRefs, unresolved };
}

function summary(plan: Plan, total: number): string {
  const head = plan.all
    ? `### E2E: all ${total} specs`
    : `### E2E: ${plan.specs.length} of ${total} specs`;
  const rows = plan.reasons.map(
    ({ path: file, reason }) => `| \`${file}\` | ${reason} |`
  );
  const specs = plan.all
    ? ""
    : `\n<details><summary>Selected specs</summary>\n\n${plan.specs.map((s) => `- ${s}`).join("\n")}\n</details>\n`;
  return `${head}\n\n| Changed file | Selection |\n|---|---|\n${rows.join("\n")}\n${specs}`;
}

function failedSpecs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of existsSync(dir)
    ? readdirSync(dir, { recursive: true })
    : []) {
    const file = String(entry);
    if (path.basename(file) === ".failed-specs.json") {
      out.push(...JSON.parse(readFileSync(path.join(dir, file), "utf8")));
    }
  }
  return [...new Set(out)].filter((spec) => spec.endsWith(".spec.ts"));
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const shadow = args[0] === "--shadow";
  const [base, head, target] = shadow ? args.slice(1) : args;
  if (!(base && head && target)) {
    console.error(
      "Usage: bun run select-tests.ts [--shadow] <base> <head> <out.json | failures-dir>"
    );
    process.exit(1);
  }
  let plan: Plan;
  let total = 0;
  try {
    const repo = loadRepo();
    total = repo.specAreas.size;
    plan = selectTests(changedFiles(base, head), repo);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    plan = {
      all: true,
      reasons: [{ path: "(planner)", reason: `failed: ${message}` }],
      specs: [],
    };
  }
  if (shadow) {
    const files = plan.reasons.map((r) => r.path).join(", ");
    const misses = shadowMisses(plan, failedSpecs(target));
    for (const spec of misses) {
      console.log(
        `::warning title=E2E selection miss::${spec} failed, but a PR with this push's changes would not have run it (changed: ${files})`
      );
    }
    console.log(
      plan.all
        ? "The planner would have run every spec."
        : `${misses.length} failed spec(s) outside the planner's selection.`
    );
  } else {
    writeFileSync(
      target,
      JSON.stringify({ all: plan.all, specs: plan.specs }, null, 2)
    );
    const text = summary(plan, total);
    console.log(text);
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
    }
  }
}
