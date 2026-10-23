/**
 * A planner miss skips a regression, so these cover each way it could select
 * too little:
 * - a deleted file, which no longer exists to match or walk from;
 * - a rename, whose old path's area must still run;
 * - a helper a spec runs as a subprocess by path, which no import reaches;
 * - a registry (mutators.ts, schema index, jobs index) the graph must not
 *   pass through, and a file only a registry imports;
 * - a source file no rule matches and nothing imports, or that only a cycle
 *   imports;
 * - a non-source or unknown file, an E2E file no spec reaches, a generated
 *   file changed without its source;
 * - a local import the graph failed to resolve, which drops an edge;
 * - the planner crashing or git failing (a shallow clone without the base):
 *   every spec runs;
 * - an empty or docs-only diff selects nothing, not everything.
 * The label and master overrides skip the planner in ci.yml.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  type Change,
  loadRepo,
  parseNameStatus,
  type Repo,
  selectTests,
  shadowMisses,
} from "./select-tests";

let repo: Repo;
let tmp: string;

beforeAll(() => {
  repo = loadRepo();
  tmp = mkdtempSync(path.join(tmpdir(), "select-tests-"));
});

afterAll(() => {
  rmSync(tmp, { force: true, recursive: true });
});

const plan = (...changes: (string | Change)[]) =>
  selectTests(
    changes.map((c) => (typeof c === "string" ? { path: c } : c)),
    repo
  );

const inArea = (area: string) =>
  [...repo.specAreas]
    .filter(([, areas]) => areas.has(area))
    .map(([spec]) => spec)
    .sort();

/** A repo with only the given import edges, for graph shapes. */
function fakeRepo(edges: Record<string, string[]>): Repo {
  const importers = new Map<string, Set<string>>();
  for (const [file, by] of Object.entries(edges)) {
    importers.set(file, new Set(by));
  }
  return {
    importers,
    perfOnly: new Set(),
    specAreas: new Map([
      ["donors/donor-directory.spec.ts", new Set(["donors"])],
      ["income/receipts.spec.ts", new Set(["income"])],
    ]),
    specRefs: new Map(),
    unresolved: [],
  };
}

describe("selectTests", () => {
  test("an empty diff selects nothing", () => {
    expect(plan()).toMatchObject({ all: false, specs: [] });
  });

  test("docs, unit tests and other workflows select nothing", () => {
    expect(
      plan(
        "docs/architecture/e2e-testing.md",
        "README.md",
        "apps/web/src/lib/paise.test.ts",
        ".github/workflows/pr-title.yml",
        "packages/e2e/perf/app.spec.ts"
      )
    ).toMatchObject({ all: false, specs: [] });
  });

  test.each([
    "bun.lock",
    "apps/web/package.json",
    ".github/workflows/ci.yml",
    "packages/e2e/playwright.config.ts",
    "packages/e2e/helpers/seed-test-user.ts",
    "packages/e2e/helpers/seed/core.ts",
    "apps/web/src/routes/_app.tsx",
  ])("%s runs the full suite", (file) => {
    expect(plan(file).all).toBe(true);
  });

  test("an unknown file outside every rule runs the full suite", () => {
    expect(plan("new-tool.config.json").all).toBe(true);
  });

  test("a changed spec selects itself only", () => {
    expect(plan("packages/e2e/tests/donors/donor-directory.spec.ts")).toEqual(
      expect.objectContaining({
        all: false,
        specs: ["donors/donor-directory.spec.ts"],
      })
    );
  });

  test("a deleted spec selects nothing; a renamed one runs at its new path", () => {
    expect(
      plan({ deleted: true, path: "packages/e2e/tests/donors/gone.spec.ts" })
        .specs
    ).toEqual([]);
    expect(
      plan({
        oldPath: "packages/e2e/tests/donors/old-name.spec.ts",
        path: "packages/e2e/tests/donors/donor-directory.spec.ts",
      }).specs
    ).toEqual(["donors/donor-directory.spec.ts"]);
  });

  test("an area file selects every spec in the area", () => {
    expect(plan("apps/web/src/components/donors/donors-table.tsx")).toEqual(
      expect.objectContaining({ all: false, specs: inArea("donors") })
    );
  });

  test("a deleted file resolves by its old path", () => {
    expect(
      plan({ deleted: true, path: "apps/web/src/components/donors/gone.tsx" })
        .specs
    ).toEqual(inArea("donors"));
  });

  test("a deleted file outside every area runs the full suite", () => {
    expect(
      plan({ deleted: true, path: "apps/web/src/components/shared/gone.tsx" })
        .all
    ).toBe(true);
  });

  test("a rename selects both paths' areas", () => {
    const { all, specs } = plan({
      oldPath: "apps/web/src/components/donors/moved.tsx",
      path: "apps/web/src/components/income/moved.tsx",
    });
    expect(all).toBe(false);
    expect(specs).toEqual(
      [...new Set([...inArea("donors"), ...inArea("income")])].sort()
    );
  });

  test("a rename out of an unmatched path lets the new path decide", () => {
    expect(
      plan({
        oldPath: "apps/web/src/lib/zz-old-name.ts",
        path: "apps/web/src/components/donors/donors-table.tsx",
      }).specs
    ).toEqual(inArea("donors"));
  });

  test("a helper a spec runs as a subprocess selects that spec", () => {
    expect(plan("packages/e2e/helpers/receipts.ts").specs).toContain(
      "income/receipts.spec.ts"
    );
    expect(plan("packages/e2e/helpers/charged-to.ts").specs).toContain(
      "analytics/analytics-dashboard.spec.ts"
    );
  });

  test("an imported page object selects the specs that import it", () => {
    const { all, specs } = plan("packages/e2e/pages/reimbursement-page.ts");
    expect(all).toBe(false);
    expect(specs).toContain("reimbursements/reimbursement-create.spec.ts");
  });

  test("an E2E file no spec reaches runs the full suite", () => {
    expect(plan("packages/e2e/helpers/zz-unused.ts").all).toBe(true);
  });

  test("a benchmark-only helper selects nothing", () => {
    expect(
      plan("packages/e2e/helpers/seed-kalakriti-performance.ts")
    ).toMatchObject({ all: false, specs: [] });
  });

  test("a seed module for an area selects that area, existing or not", () => {
    expect(plan("packages/e2e/helpers/seed/donors.ts").specs).toEqual(
      inArea("donors")
    );
  });

  test("a mutator a registry imports selects its area, not everything", () => {
    const { all, specs } = plan("packages/zero/src/mutators/reimbursement.ts");
    expect(all).toBe(false);
    expect(specs).toEqual(expect.arrayContaining(inArea("reimbursements")));
    expect(specs).not.toContain("kalakriti/golive.spec.ts");
  });

  test("a job handler selects its area by name", () => {
    expect(plan("packages/jobs/src/handlers/notify-vendor.ts").specs).toEqual(
      inArea("vendors")
    );
  });

  test("a changed registry runs the full suite", () => {
    expect(plan("packages/zero/src/mutators.ts").all).toBe(true);
    expect(plan("packages/jobs/src/handlers/index.ts").all).toBe(true);
  });

  test("a shared component selects the areas that import it", () => {
    const { all, specs } = plan(
      "apps/web/src/components/shared/requester-meta.tsx"
    );
    expect(all).toBe(false);
    expect(specs).toEqual(
      expect.arrayContaining([
        ...inArea("reimbursements"),
        ...inArea("vendors"),
      ])
    );
  });

  test("a design-system file the root layout imports runs the full suite", () => {
    expect(plan("packages/design-system/components/ui/button.tsx").all).toBe(
      true
    );
  });

  test("layout files select the sidebar and authorization areas", () => {
    expect(
      plan("apps/web/src/components/layout/app-sidebar.tsx").specs
    ).toEqual([...inArea("sidebar"), ...inArea("authorization")].sort());
  });

  test("the signing service selects governance and the specs that sign", () => {
    const { all, specs } = plan("services/signing/pidash_signing/app.py");
    expect(all).toBe(false);
    expect(specs).toEqual(
      expect.arrayContaining([
        ...inArea("governance"),
        "finance/utilisation-certificates.spec.ts",
      ])
    );
  });

  test.each([
    ["packages/zero/src/schema.ts", "packages/db/src/schema/team.ts"],
    [
      "packages/db/src/migrations/9999_example.sql",
      "packages/db/src/schema/team.ts",
    ],
    [
      "apps/web/src/routeTree.gen.ts",
      "apps/web/src/routes/_app/donors/index.tsx",
    ],
  ])("generated %s follows its source in the same diff", (file, source) => {
    expect(plan(file, source).all).toBe(false);
    expect(plan(file).all).toBe(true);
  });

  test("a spec's @e2e-areas comment adds it to those areas", () => {
    for (const [spec, areas] of repo.specAreas) {
      for (const area of [...areas].slice(1)) {
        expect(inArea(area)).toContain(spec);
      }
    }
  });

  test("selection is whole spec files", () => {
    for (const spec of plan("apps/web/src/components/donors/donors-table.tsx")
      .specs) {
      expect(spec).toMatch(/^[\w-]+\/[\w.-]+\.spec\.ts$/);
    }
  });
});

describe("the import graph", () => {
  test("every local import resolves", () => {
    expect(repo.unresolved).toEqual([]);
  });

  test("a file with no importers and no area runs the full suite", () => {
    const fake = fakeRepo({});
    expect(
      selectTests([{ path: "apps/web/src/lib/zz-orphan.ts" }], fake).all
    ).toBe(true);
  });

  test("an unmatched file walks up to its importers' areas", () => {
    const fake = fakeRepo({
      "apps/web/src/lib/zz-a.ts": ["apps/web/src/lib/zz-b.ts"],
      "apps/web/src/lib/zz-b.ts": ["apps/web/src/components/donors/x.tsx"],
    });
    expect(selectTests([{ path: "apps/web/src/lib/zz-a.ts" }], fake)).toEqual(
      expect.objectContaining({
        all: false,
        specs: ["donors/donor-directory.spec.ts"],
      })
    );
  });

  test("a path that ends at an unmatched root runs the full suite", () => {
    const fake = fakeRepo({
      "apps/web/src/lib/zz-a.ts": [
        "apps/web/src/components/donors/x.tsx",
        "apps/web/src/lib/zz-root.ts",
      ],
    });
    expect(selectTests([{ path: "apps/web/src/lib/zz-a.ts" }], fake).all).toBe(
      true
    );
  });

  test("a file only a registry imports runs the full suite", () => {
    const fake = fakeRepo({
      "packages/zero/src/mutators/zz-misc.ts": [
        "packages/zero/src/mutators.ts",
      ],
    });
    expect(
      selectTests([{ path: "packages/zero/src/mutators/zz-misc.ts" }], fake).all
    ).toBe(true);
  });

  test("a file only a cycle imports runs the full suite", () => {
    const fake = fakeRepo({
      "apps/web/src/lib/zz-a.ts": ["apps/web/src/lib/zz-b.ts"],
      "apps/web/src/lib/zz-b.ts": ["apps/web/src/lib/zz-a.ts"],
    });
    expect(selectTests([{ path: "apps/web/src/lib/zz-a.ts" }], fake).all).toBe(
      true
    );
  });
});

describe("parseNameStatus", () => {
  test("reads modified, added, deleted, renamed and copied paths", () => {
    const output = [
      "M",
      "a.ts",
      "A",
      "dir with space/b.ts",
      "D",
      "c.ts",
      "R087",
      "old.ts",
      "new.ts",
      "C100",
      "src.ts",
      "copy.ts",
      "",
    ].join("\0");
    expect(parseNameStatus(output)).toEqual([
      { path: "a.ts" },
      { path: "dir with space/b.ts" },
      { deleted: true, path: "c.ts" },
      { oldPath: "old.ts", path: "new.ts" },
      { path: "copy.ts" },
    ]);
  });
});

describe("shadowMisses", () => {
  test("names failed specs the plan skipped, and none for a full plan", () => {
    const partial = { all: false, reasons: [], specs: ["donors/a.spec.ts"] };
    expect(
      shadowMisses(partial, ["donors/a.spec.ts", "income/b.spec.ts"])
    ).toEqual(["income/b.spec.ts"]);
    expect(
      shadowMisses({ ...partial, all: true }, ["income/b.spec.ts"])
    ).toEqual([]);
  });
});

describe("the CLI", () => {
  test("a base git can't diff against selects every spec", () => {
    const out = path.join(tmp, "selection.json");
    execFileSync(
      "bun",
      [
        path.join(import.meta.dirname, "select-tests.ts"),
        "0000000000000000000000000000000000000000",
        "HEAD",
        out,
      ],
      { env: { ...process.env, GITHUB_STEP_SUMMARY: "" }, stdio: "pipe" }
    );
    expect(JSON.parse(readFileSync(out, "utf8"))).toMatchObject({ all: true });
  });
});
