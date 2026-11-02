/**
 * The direct dependencies a change to bun.lock or a package.json touches, for
 * select-tests.ts. A changed lockfile package counts against every workspace
 * dependency that pulls it in, directly or transitively. Any other change to
 * the file returns a reason to run the full suite instead.
 */

const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
] as const;

type Manifest = Record<string, unknown> & {
  workspaces?: unknown;
};
type DependencyMap = Record<string, string>;
type LockEntry = [string, ...unknown[]];

interface Lockfile {
  catalog?: DependencyMap;
  packages?: Record<string, LockEntry>;
  workspaces?: Record<string, Manifest>;
  [key: string]: unknown;
}

export type DependencyChange = { names: string[] } | { all: string };

/** bun.lock is JSON with trailing commas. */
function parseJsonc(text: string): unknown {
  return JSON.parse(text.replace(/,(\s*[}\]])/g, "$1"));
}

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

/** Keys whose values differ between two maps, including added and removed ones. */
function changedKeys(
  before: Record<string, unknown> = {},
  after: Record<string, unknown> = {}
): string[] {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    (key) => !same(before[key], after[key])
  );
}

/** The manifest's dependency fields, and the root's catalog, by name. */
function dependencyNames(before: Manifest, after: Manifest): string[] {
  const names = DEPENDENCY_FIELDS.flatMap((field) =>
    changedKeys(
      before[field] as DependencyMap | undefined,
      after[field] as DependencyMap | undefined
    )
  );
  const catalog = (manifest: Manifest) =>
    (manifest.workspaces as { catalog?: DependencyMap } | undefined)?.catalog;
  return [...names, ...changedKeys(catalog(before), catalog(after))];
}

/** The manifest without its dependency fields and catalog. */
function withoutDependencies(manifest: Manifest): Manifest {
  const rest: Manifest = { ...manifest };
  for (const field of DEPENDENCY_FIELDS) {
    delete rest[field];
  }
  if (rest.workspaces && !Array.isArray(rest.workspaces)) {
    const { catalog: _, ...workspaces } = rest.workspaces as Record<
      string,
      unknown
    >;
    rest.workspaces = workspaces;
  }
  return rest;
}

function manifestChange(before: string, after: string): DependencyChange {
  const old = JSON.parse(before) as Manifest;
  const now = JSON.parse(after) as Manifest;
  if (!same(withoutDependencies(old), withoutDependencies(now))) {
    return { all: "changes more than its dependencies" };
  }
  return { names: dependencyNames(old, now) };
}

/** `name@version` to `name`, keeping a scope's leading `@`. */
const packageName = (entry: LockEntry) =>
  entry[0].slice(0, entry[0].lastIndexOf("@"));

function lockChange(before: string, after: string): DependencyChange {
  const old = parseJsonc(before) as Lockfile;
  const now = parseJsonc(after) as Lockfile;
  const { catalog: _c, packages: _p, workspaces: _w, ...oldRest } = old;
  const { catalog: _c2, packages: _p2, workspaces: _w2, ...nowRest } = now;
  if (!same(oldRest, nowRest)) {
    return { all: "changes lockfile settings" };
  }
  const workspaceNames = (lock: Lockfile) =>
    Object.keys(lock.workspaces ?? {}).sort();
  if (!same(workspaceNames(old), workspaceNames(now))) {
    return { all: "adds or removes a workspace" };
  }

  const seeds = new Set<string>(changedKeys(old.catalog, now.catalog));
  for (const key of workspaceNames(now)) {
    const a = old.workspaces?.[key] ?? {};
    const b = now.workspaces?.[key] ?? {};
    if (!same(withoutDependencies(a), withoutDependencies(b))) {
      return {
        all: `changes workspace ${key || "(root)"} beyond its dependencies`,
      };
    }
    for (const name of dependencyNames(a, b)) {
      seeds.add(name);
    }
  }
  for (const key of changedKeys(old.packages, now.packages)) {
    for (const entry of [old.packages?.[key], now.packages?.[key]]) {
      if (entry) {
        seeds.add(packageName(entry));
      }
    }
  }

  // Dependents by name, from both sides, so a removed edge still counts.
  const dependents = new Map<string, Set<string>>();
  for (const lock of [old, now]) {
    for (const entry of Object.values(lock.packages ?? {})) {
      const info = entry.find(
        (part): part is Record<string, DependencyMap> =>
          typeof part === "object" && part !== null && !Array.isArray(part)
      );
      for (const field of [
        "dependencies",
        "optionalDependencies",
        "peerDependencies",
      ]) {
        for (const dependency of Object.keys(info?.[field] ?? {})) {
          const set = dependents.get(dependency) ?? new Set();
          set.add(packageName(entry));
          dependents.set(dependency, set);
        }
      }
    }
  }
  const direct = new Set<string>();
  for (const lock of [old, now]) {
    for (const manifest of Object.values(lock.workspaces ?? {})) {
      for (const field of DEPENDENCY_FIELDS) {
        for (const name of Object.keys(
          (manifest[field] as DependencyMap | undefined) ?? {}
        )) {
          direct.add(name);
        }
      }
    }
  }
  const workspacePackages = new Set(
    Object.values(now.workspaces ?? {}).map((manifest) => manifest.name)
  );

  const found = new Set<string>();
  const seen = new Set<string>();
  const queue = [...seeds];
  while (queue.length > 0) {
    const name = queue.shift() as string;
    if (seen.has(name)) {
      continue;
    }
    seen.add(name);
    if (direct.has(name) && !workspacePackages.has(name)) {
      found.add(name);
    }
    queue.push(...(dependents.get(name) ?? []));
  }
  return { names: [...found].sort() };
}

/**
 * The direct dependencies a change to `file` touches. `before` is undefined
 * for a new file and `after` for a deleted one.
 */
export function dependencyChange(
  file: string,
  before: string | undefined,
  after: string | undefined
): DependencyChange {
  if (before === undefined || after === undefined) {
    return { all: before === undefined ? "added" : "deleted" };
  }
  try {
    return file.endsWith("bun.lock")
      ? lockChange(before, after)
      : manifestChange(before, after);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { all: `doesn't parse: ${message}` };
  }
}
