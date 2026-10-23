// Enforces the mechanical parts of "Every test must be able to go red" in
// .agents/skills/e2e-testing/SKILL.md over tests/**/*.spec.ts.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { parseSync } from "oxc-parser";

import { roleOnlySpecs } from "./project-selection";

type RoleLists = Readonly<Record<string, readonly string[]>>;
type Node = { type: string; start: number; end: number } & Record<
  string,
  unknown
>;
interface Entry {
  node: Node;
  up: Node[];
}

const testsDir = join(import.meta.dirname, "tests");

/**
 * Violations accepted for now, keyed by `<spec> <rule>`. Each needs a reason;
 * an entry that no longer matches a violation fails the suite.
 */
const allowlist: Record<string, string> = {};

const FUNCTIONS = new Set([
  "ArrowFunctionExpression",
  "FunctionExpression",
  "FunctionDeclaration",
]);
const TEST_CALLS = new Set(["test", "test.only"]);
const PAGE_STATE = new Set([
  "count",
  "isVisible",
  "isHidden",
  "textContent",
  "innerText",
  "isChecked",
]);

const RULES = {
  R1: "R1 permanently disabled test: delete it or make it pass; git history keeps it",
  R2: "R2 role skip after page work: make the role skip the first statement of the test or beforeEach",
  R3: "R3 data-dependent skip or guard: assert the precondition exists, then act on it",
  R4: "R4 single-role file not listed: add it to roleOnlySpecs in packages/e2e/project-selection.ts",
};

const isNode = (value: unknown): value is Node =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as Node).type === "string";

const child = (node: Node, key: string) =>
  isNode(node[key]) ? node[key] : undefined;

const items = (node: Node, key: string) =>
  Array.isArray(node[key]) ? (node[key] as unknown[]).filter(isNode) : [];

function children(node: Node): Node[] {
  return Object.values(node).flatMap((value) => {
    if (Array.isArray(value)) {
      return value.filter(isNode);
    }
    return isNode(value) ? [value] : [];
  });
}

function collect(node: Node, out: Entry[], up: Node[] = []): Entry[] {
  out.push({ node, up });
  const next = [...up, node];
  for (const c of children(node)) {
    collect(c, out, next);
  }
  return out;
}

/** Nodes under `root`, not descending into functions nested inside it. */
function own(root: Node): Node[] {
  const out: Node[] = [];
  const visit = (node: Node) => {
    out.push(node);
    for (const c of children(node)) {
      if (!FUNCTIONS.has(c.type)) {
        visit(c);
      }
    }
  };
  visit(root);
  return out;
}

function path(node: Node | undefined): string {
  if (!node) {
    return "?";
  }
  if (node.type === "Identifier") {
    return String(node.name);
  }
  if (node.type === "MemberExpression" && !node.computed) {
    return `${path(child(node, "object"))}.${path(child(node, "property"))}`;
  }
  if (node.type === "CallExpression") {
    return `${path(child(node, "callee"))}()`;
  }
  return "?";
}

const calleeOf = (node: Node) =>
  node.type === "CallExpression" ? path(child(node, "callee")) : "";

const lastFunction = (node: Node) =>
  items(node, "arguments").findLast((arg) => FUNCTIONS.has(arg.type));

const isDescribe = (callee: string) =>
  callee.startsWith("test.describe") && callee !== "test.describe.configure";

/** `<x>.project.name` or a destructured `project.name`. */
function readsProject(expr: Node): boolean {
  return [expr, ...descendants(expr)].some((node) => {
    if (node.type !== "MemberExpression" || node.computed) {
      return false;
    }
    const object = child(node, "object");
    return (
      path(child(node, "property")) === "name" &&
      (path(object) === "project" ||
        (object?.type === "MemberExpression" &&
          path(child(object, "property")) === "project"))
    );
  });
}

function descendants(node: Node): Node[] {
  return children(node).flatMap((c) => [c, ...descendants(c)]);
}

/** The role a condition gates to, when it is exactly `project.name !== "role"`. */
function gatedRole(conditions: Node[]): string | undefined {
  if (conditions.length !== 1) {
    return undefined;
  }
  const [condition] = conditions;
  if (
    condition.type !== "BinaryExpression" ||
    (condition.operator !== "!==" && condition.operator !== "!=")
  ) {
    return undefined;
  }
  const sides = [child(condition, "left"), child(condition, "right")];
  const literal = sides.find(
    (side) => side?.type === "Literal" && typeof side.value === "string"
  );
  const project = sides.find(
    (side) =>
      side?.type === "MemberExpression" &&
      side !== literal &&
      readsProject(side)
  );
  return literal && project ? String(literal.value) : undefined;
}

function analyze(file: string, source: string, roles: RoleLists): string[] {
  const parsed = parseSync(file, source);
  if (parsed.errors.length > 0) {
    return [`tests/${file}:1 does not parse: ${parsed.errors[0].message}`];
  }
  const program = parsed.program as unknown as Node;
  const entries = collect(program, []);
  const lineStarts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\n") {
      lineStarts.push(i + 1);
    }
  }
  const lineOf = (node: Node) =>
    lineStarts.findLastIndex((start) => start <= node.start) + 1;
  const violations: string[] = [];
  const report = (node: Node, rule: keyof typeof RULES, detail: string) =>
    violations.push(
      `tests/${file}:${lineOf(node)} [${rule}] ${detail}. ${RULES[rule].slice(3)}`
    );

  const parentOf = new Map<Node, Node>();
  for (const { node, up } of entries) {
    if (up.length > 0) {
      parentOf.set(node, up.at(-1) as Node);
    }
  }

  const declarations = new Map<Node, Map<string, Node[]>>();
  function declared(scope: Node): Map<string, Node[]> {
    let map = declarations.get(scope);
    if (map) {
      return map;
    }
    map = new Map();
    for (const node of own(scope)) {
      const pairs: [Node | undefined, Node | undefined][] = [];
      if (node.type === "VariableDeclarator") {
        pairs.push([child(node, "id"), child(node, "init")]);
      } else if (node.type === "AssignmentExpression") {
        pairs.push([child(node, "left"), child(node, "right")]);
      }
      for (const [target, value] of pairs) {
        if (!(target && value)) {
          continue;
        }
        const names = [target, ...descendants(target)]
          .filter((n) => n.type === "Identifier")
          .map((n) => String(n.name));
        for (const name of names) {
          map.set(name, [...(map.get(name) ?? []), value]);
        }
      }
    }
    declarations.set(scope, map);
    return map;
  }

  function pageDependent(expr: Node, scopes: Node[], seen = new Set<string>()) {
    const visit = (node: Node): boolean => {
      if (node.type === "CallExpression") {
        const callee = child(node, "callee");
        if (
          callee?.type === "MemberExpression" &&
          PAGE_STATE.has(path(child(callee, "property")))
        ) {
          return true;
        }
      }
      if (node.type === "Identifier" && !seen.has(String(node.name))) {
        seen.add(String(node.name));
        return scopes.some((scope) =>
          (declared(scope).get(String(node.name)) ?? []).some((value) =>
            pageDependent(value, scopes, seen)
          )
        );
      }
      if (node.type === "MemberExpression" && !node.computed) {
        const object = child(node, "object");
        return object ? visit(object) : false;
      }
      if (node.type === "Property" && !node.computed) {
        const value = child(node, "value");
        return value ? visit(value) : false;
      }
      return children(node).some(visit);
    };
    return visit(expr);
  }

  const scopesOf = (up: Node[]) =>
    up.filter((node) => node.type === "Program" || FUNCTIONS.has(node.type));

  /** Conditions guarding `node` inside its own function. */
  function guards(node: Node, up: Node[]) {
    const conditions: Node[] = [];
    let guarded = false;
    let below = node;
    for (const above of [...up].toReversed()) {
      if (FUNCTIONS.has(above.type)) {
        break;
      }
      if (above.type === "IfStatement" && child(above, "test") !== below) {
        conditions.push(child(above, "test") as Node);
        guarded = true;
      } else if (
        above.type === "ConditionalExpression" &&
        child(above, "test") !== below
      ) {
        conditions.push(child(above, "test") as Node);
        guarded = true;
      } else if (
        above.type === "LogicalExpression" &&
        child(above, "right") === below
      ) {
        conditions.push(child(above, "left") as Node);
        guarded = true;
      } else if (above.type === "CatchClause" || above.type === "SwitchCase") {
        guarded = true;
      }
      below = above;
    }
    return { conditions, guarded };
  }

  interface Skip {
    node: Node;
    conditions: Node[];
    role: boolean;
  }
  function skipOf(node: Node, up: Node[]): Skip {
    const [first] = items(node, "arguments");
    const conditions = guards(node, up).conditions;
    if (first && !FUNCTIONS.has(first.type) && first.value !== true) {
      conditions.unshift(first);
    }
    return { node, conditions, role: conditions.some(readsProject) };
  }

  const upOf = new Map(entries.map(({ node, up }) => [node, up]));
  const skipsIn = (fn: Node) =>
    own(fn)
      .filter((node) => calleeOf(node) === "test.skip")
      .map((node) => skipOf(node, upOf.get(node) as Node[]));
  const awaitsIn = (fn: Node) =>
    own(fn).filter(
      (node) =>
        node.type === "AwaitExpression" ||
        (node.type === "ForOfStatement" && node.await === true)
    );

  /** beforeEach callbacks in the file and every describe around `call`. */
  function beforeEachHooks(call: Node, up: Node[]): Node[] {
    const bodies = [
      program,
      ...up.filter(
        (node) =>
          FUNCTIONS.has(node.type) &&
          isDescribe(calleeOf(parentOf.get(node) as Node))
      ),
    ].map((scope) =>
      scope.type === "Program" ? scope : (child(scope, "body") as Node)
    );
    return bodies.flatMap((body) =>
      items(body, "body").flatMap((statement) => {
        const expression = child(statement, "expression");
        const fn =
          expression && calleeOf(expression) === "test.beforeEach"
            ? lastFunction(expression)
            : undefined;
        return fn && fn !== call ? [fn] : [];
      })
    );
  }

  /** The first await in a hook that runs before the hook's own role skip. */
  function hookWork(hook: Node): Node | undefined {
    const [firstAwait] = awaitsIn(hook);
    const gate = skipsIn(hook).find((skip) => skip.role);
    return firstAwait && !(gate && gate.node.start < firstAwait.start)
      ? firstAwait
      : undefined;
  }

  for (const { node, up } of entries) {
    const callee = calleeOf(node);
    const args = items(node, "arguments");

    if (
      callee === "test.fixme" ||
      callee.startsWith("test.describe.skip") ||
      callee.startsWith("test.describe.fixme")
    ) {
      report(node, "R1", `${callee}(...) never runs`);
      continue;
    }

    if (node.type === "IfStatement") {
      const condition = child(node, "test") as Node;
      // A branch on page state that asserts on both sides still discriminates.
      const asserts = [child(node, "consequent"), child(node, "alternate")].map(
        (branch) =>
          branch
            ? [branch, ...descendants(branch)].some((n) => {
                const c = calleeOf(n);
                return c === "expect" || c.startsWith("expect.");
              })
            : false
      );
      // Cleanup may depend on what an earlier step left behind.
      const cleanup = up.some(
        (above, i) =>
          (above.type === "TryStatement" &&
            child(above, "finalizer") === up[i + 1]) ||
          (FUNCTIONS.has(above.type) &&
            ["test.afterEach", "test.afterAll"].includes(
              calleeOf(parentOf.get(above) as Node)
            ))
      );
      if (
        asserts.includes(true) &&
        asserts.includes(false) &&
        !cleanup &&
        pageDependent(condition, scopesOf(up))
      ) {
        report(node, "R3", "expect runs only when the page shows something");
      }
      continue;
    }

    if (callee !== "test.skip") {
      continue;
    }
    const [first] = args;
    if (
      first &&
      (first.type === "TemplateLiteral" ||
        (first.type === "Literal" && typeof first.value === "string")) &&
      args.some((arg) => FUNCTIONS.has(arg.type))
    ) {
      report(node, "R1", 'test.skip("title", fn) never runs');
      continue;
    }
    if (
      !guards(node, up).guarded &&
      (args.length === 0 || first?.value === true)
    ) {
      report(node, "R1", "unconditional test.skip");
      continue;
    }

    const fn = up.findLast((n) => FUNCTIONS.has(n.type));
    if (!fn) {
      continue;
    }
    const skip = skipOf(node, up);
    if (
      skip.conditions.some((condition) =>
        pageDependent(condition, scopesOf(up))
      )
    ) {
      report(node, "R3", "skip depends on what the page shows");
      continue;
    }
    if (!skip.role) {
      continue;
    }
    const earlier = awaitsIn(fn).find((a) => a.start < node.start);
    if (earlier) {
      report(
        node,
        "R2",
        `role skip runs after the await on line ${lineOf(earlier)}`
      );
      continue;
    }
    const call = parentOf.get(fn) as Node;
    if (TEST_CALLS.has(calleeOf(call))) {
      for (const hook of beforeEachHooks(fn, up)) {
        const work = hookWork(hook);
        if (work) {
          report(
            node,
            "R2",
            `beforeEach awaits on line ${lineOf(work)} before this role skip`
          );
        }
      }
    }
  }

  // R4: every test gated to the same single role.
  const tests = entries.filter(
    ({ node }) => TEST_CALLS.has(calleeOf(node)) && lastFunction(node)
  );
  const gates = tests.map(({ node, up }) => {
    const fn = lastFunction(node) as Node;
    const roleSkips = [fn, ...beforeEachHooks(fn, [...up, node])]
      .flatMap(skipsIn)
      .filter((skip) => skip.role);
    const found = new Set(roleSkips.map((skip) => gatedRole(skip.conditions)));
    return found.size === 1 ? [...found][0] : undefined;
  });
  const [role] = gates;
  if (
    role &&
    role in roles &&
    gates.every((gate) => gate === role) &&
    !roles[role].includes(file)
  ) {
    const listed = Object.keys(roles).find((owner) =>
      roles[owner].includes(file)
    );
    report(
      tests[0].node,
      "R4",
      `every test is gated to ${role}${listed ? ` but it is listed under ${listed}` : ""}`
    );
  }

  return violations;
}

function specs(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      return specs(full);
    }
    return entry.name.endsWith(".spec.ts") ? [full] : [];
  });
}

const allowKey = (violation: string) => {
  const [location, rule] = violation.split(" ");
  return `${location.replace(/^tests\//, "").replace(/:\d+$/, "")} ${rule.slice(1, -1)}`;
};

test("every spec follows the go-red rules", () => {
  const violations = specs(testsDir).flatMap((file) =>
    analyze(relative(testsDir, file), readFileSync(file, "utf8"), roleOnlySpecs)
  );
  expect(violations.filter((v) => !(allowKey(v) in allowlist))).toEqual([]);
  const matched = new Set(violations.map(allowKey));
  expect(Object.keys(allowlist).filter((key) => !matched.has(key))).toEqual([]);
});

test("every roleOnlySpecs entry names an existing spec", () => {
  const existing = new Set(
    specs(testsDir).map((file) => relative(testsDir, file))
  );
  expect(
    Object.values(roleOnlySpecs)
      .flat()
      .filter((file) => !existing.has(file))
  ).toEqual([]);
});

describe("rule fixtures", () => {
  const roles: RoleLists = {
    super_admin: ["listed.spec.ts"],
    admin: [],
    volunteer: [],
  };
  const rules = (source: string, file = "fixture.spec.ts") =>
    analyze(file, source, roles).map((v) => v.split(" ")[1]);

  test("R1 flags permanently disabled tests", () => {
    expect(
      rules(`
        test.describe.skip("off", () => {});
        test.fixme("later", async () => {});
        test.skip("title", async () => {});
        test("a", async () => { test.skip(); });
        test("b", async () => { test.skip(true, "broken"); });
      `)
    ).toEqual(["[R1]", "[R1]", "[R1]", "[R1]", "[R1]"]);
  });

  test("R1 allows conditional and environment skips", () => {
    expect(
      rules(`
        test("a", async ({}, testInfo) => {
          if (testInfo.project.name !== "super_admin") { test.skip(); }
          test.skip(Boolean(process.env.CI), "needs R2");
        });
        test("b", async () => {});
      `)
    ).toEqual([]);
  });

  test("R2 flags role skips after an await or a navigating beforeEach", () => {
    expect(
      rules(`
        test("a", async ({ page }, testInfo) => {
          await page.goto("/");
          test.skip(testInfo.project.name !== "admin", "Admin");
        });
        test.describe("d", () => {
          test.beforeEach(async ({ page }) => { await page.goto("/"); });
          test("b", async ({ page }, { project }) => {
            test.skip(project.name !== "admin", "Admin");
          });
        });
        test("c", async () => {});
      `)
    ).toEqual(["[R2]", "[R2]"]);
  });

  test("R2 allows a first-statement skip and an idle beforeEach", () => {
    expect(
      rules(`
        test.beforeEach(({ page: _page }) => {});
        test.beforeEach(async ({ page }, testInfo) => {
          test.skip(testInfo.project.name !== "admin", "Admin");
          await page.goto("/");
        });
        test("a", async ({ page }) => { await page.goto("/"); });
      `)
    ).toEqual(["[R4]"]);
  });

  test("R3 flags skips and expects guarded on page state", () => {
    expect(
      rules(`
        test("a", async ({ page }) => {
          const rows = page.getByRole("row");
          const hasRows = (await rows.count()) > 0;
          test.skip(!hasRows, "No rows");
          if (!(await page.getByText("x").isVisible())) { test.skip(true, "none"); }
          if (hasRows) { await expect(rows.first()).toBeVisible(); }
        });
        test("b", async () => {});
      `)
    ).toEqual(["[R3]", "[R3]", "[R3]"]);
  });

  test("R3 allows environment guards and page-state branches without expects", () => {
    expect(
      rules(`
        test("a", async ({ page, isMobile }) => {
          if (isMobile) { await expect(page.getByText("x")).toBeVisible(); }
          if (process.env.CI) { test.skip(true, "needs R2"); }
          if (await page.getByRole("dialog").isVisible()) { await page.keyboard.press("Escape"); }
          const was = await page.getByRole("switch").isChecked();
          if (was) { await expect(page.getByRole("switch")).toBeChecked(); }
          else { await expect(page.getByRole("switch")).not.toBeChecked(); }
          try {} finally {
            if (await page.getByText("x").isVisible()) { await expect(page.getByText("x")).toBeHidden(); }
          }
        });
        test.afterEach(async ({ page }) => {
          if (await page.getByText("x").isVisible()) { await expect(page.getByText("x")).toBeHidden(); }
        });
        test("b", async () => {});
      `)
    ).toEqual([]);
  });

  test("R4 flags an unlisted single-role file", () => {
    const source = `
      test.beforeEach(({}, testInfo) => {
        test.skip(testInfo.project.name !== "super_admin", "Admin");
      });
      test("a", async () => {});
      test("b", async ({}, testInfo) => {
        if (testInfo.project.name !== "super_admin") { test.skip(); }
      });
    `;
    expect(rules(source)).toEqual(["[R4]"]);
    expect(rules(source, "listed.spec.ts")).toEqual([]);
  });

  test("R4 ignores mixed roles and gates it cannot classify", () => {
    expect(
      rules(`
        test("a", async ({}, testInfo) => {
          test.skip(testInfo.project.name !== "super_admin", "Admin");
        });
        test("b", async ({}, testInfo) => {
          test.skip(testInfo.project.name !== "volunteer", "Volunteer");
        });
      `)
    ).toEqual([]);
    expect(
      rules(`
        for (const role of ["admin"]) {
          test(role, async ({}, testInfo) => {
            test.skip(testInfo.project.name !== role, "Role");
          });
        }
      `)
    ).toEqual([]);
  });
});
